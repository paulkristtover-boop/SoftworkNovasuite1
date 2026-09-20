const { pool } = require('../database');
const { updateBalance } = require('./userService');
const { getSetting } = require('./settingsService');
const { checkDailyLimits, checkCooldown, recordEvent } = require('./fraudService');
const { randomToken, idempotencyKey } = require('../utils/helpers');
const config = require('../config');

async function createAd({ ownerId, title, description, url, type, reward, budget, maxViews, durationSec }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query('SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE', [ownerId]);
    if (!u.rows[0] || parseFloat(u.rows[0].balance) < budget) throw new Error('Insufficient balance for ad budget');
    const count = await client.query(
      `SELECT COUNT(*) FROM ads WHERE owner_id=$1 AND status IN ('pending','active','paused')`,
      [ownerId]
    );
    if (parseInt(count.rows[0].count, 10) >= config.maxAdsPerUser) throw new Error('Too many active ads');
    const newBal = parseFloat(u.rows[0].balance) - budget;
    await client.query('UPDATE users SET balance=$1, updated_at=NOW() WHERE telegram_id=$2', [newBal, ownerId]);
    const res = await client.query(
      `INSERT INTO ads (owner_id, title, description, url, type, reward, budget, max_views, duration_sec, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') RETURNING *`,
      [
        ownerId,
        title,
        description || null,
        url,
        type || 'website',
        reward,
        budget,
        maxViews || null,
        durationSec || config.adViewDurationSec,
      ]
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, reference_type, note, idempotency_key)
       VALUES ($1,'ad_spend',$2,$3,$4,'ad','Ad budget reserved',$5)`,
      [ownerId, -budget, newBal, res.rows[0].id, idempotencyKey('ad_spend', res.rows[0].id)]
    );
    await client.query('COMMIT');
    return res.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getAvailableAdForUser(userId) {
  const limits = await checkDailyLimits(userId);
  if (!limits.ok) return { error: limits.reason };
  const cool = await checkCooldown(userId);
  if (!cool.ok) return { error: cool.reason };

  const res = await pool.query(
    `SELECT a.* FROM ads a
     WHERE a.status='active'
       AND (a.max_views IS NULL OR a.views_done < a.max_views)
       AND a.spent + a.reward <= a.budget
       AND a.owner_id != $1
       AND NOT EXISTS (
         SELECT 1 FROM ad_views av WHERE av.ad_id=a.id AND av.user_id=$1 AND av.verified=TRUE
       )
     ORDER BY RANDOM() LIMIT 1`,
    [userId]
  );
  return { ad: res.rows[0] || null };
}

async function listMyAds(ownerId, limit = 20) {
  const res = await pool.query(
    `SELECT * FROM ads WHERE owner_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [ownerId, limit]
  );
  return res.rows;
}

async function getAd(adId) {
  const res = await pool.query(`SELECT * FROM ads WHERE id=$1`, [adId]);
  return res.rows[0] || null;
}

async function startAdView(adId, userId) {
  const limits = await checkDailyLimits(userId);
  if (!limits.ok) throw new Error(limits.reason);
  const cool = await checkCooldown(userId);
  if (!cool.ok) throw new Error(cool.reason);

  const ad = await pool.query(`SELECT * FROM ads WHERE id=$1 AND status='active'`, [adId]);
  if (!ad.rows[0]) throw new Error('Ad not available');
  const row = ad.rows[0];
  if (parseFloat(row.spent) + parseFloat(row.reward) > parseFloat(row.budget)) {
    throw new Error('Ad budget exhausted');
  }

  const token = randomToken(16);
  await pool.query(
    `INSERT INTO ad_views (ad_id, user_id, reward, client_token, status, started_at)
     VALUES ($1,$2,$3,$4,'started',NOW())
     ON CONFLICT (ad_id, user_id) DO UPDATE
       SET client_token=$4, started_at=NOW(), status='started', verified=FALSE, completed_at=NULL
       WHERE ad_views.verified=FALSE`,
    [adId, userId, row.reward, token]
  );
  const durationSec = parseInt(row.duration_sec, 10) || config.adViewDurationSec;
  return { token, durationSec, ad: row };
}

async function completeAdView(adId, userId, clientToken) {
  const client = await pool.connect();
  let rewardAmount = 0;
  try {
    await client.query('BEGIN');
    const view = await client.query(
      `SELECT * FROM ad_views WHERE ad_id=$1 AND user_id=$2 FOR UPDATE`,
      [adId, userId]
    );
    if (!view.rows[0]) throw new Error('View session not found. Tap Start verified view first.');
    const v = view.rows[0];
    if (v.verified) throw new Error('Already credited for this ad');
    if (v.client_token !== clientToken) {
      await recordEvent(userId, 'invalid_view_token', 3, { adId });
      throw new Error('Invalid session — start the view again');
    }

    const adRes = await client.query(`SELECT * FROM ads WHERE id=$1 FOR UPDATE`, [adId]);
    if (!adRes.rows[0] || adRes.rows[0].status !== 'active') throw new Error('Ad not available');
    const ad = adRes.rows[0];
    const needSec = Math.max(5, (parseInt(ad.duration_sec, 10) || config.adViewDurationSec) - 2);
    const elapsed = (Date.now() - new Date(v.started_at).getTime()) / 1000;
    if (elapsed < needSec) {
      await recordEvent(userId, 'early_complete', 1, { adId, elapsed, needSec });
      throw new Error(`Please wait at least ${needSec + 2}s with the link open, then confirm again`);
    }

    if (parseFloat(ad.spent) + parseFloat(ad.reward) > parseFloat(ad.budget)) {
      throw new Error('Ad budget exhausted');
    }

    await client.query(
      `UPDATE ad_views SET verified=TRUE, completed_at=NOW(), status='completed' WHERE id=$1`,
      [v.id]
    );
    const newSpent = parseFloat(ad.spent) + parseFloat(ad.reward);
    const newViews = ad.views_done + 1;
    let status = ad.status;
    if ((ad.max_views && newViews >= ad.max_views) || newSpent + parseFloat(ad.reward) > parseFloat(ad.budget)) {
      status = 'finished';
    }
    await client.query(
      `UPDATE ads SET spent=$1, views_done=$2, status=$3, updated_at=NOW() WHERE id=$4`,
      [newSpent, newViews, status, adId]
    );
    rewardAmount = parseFloat(ad.reward);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await updateBalance(userId, rewardAmount, 'ad_reward', {
    note: `Viewed ad #${adId}`,
    referenceId: adId,
    referenceType: 'ad',
    idempotencyKey: idempotencyKey('ad_reward', adId, userId),
  });

  const user = await pool.query('SELECT referred_by FROM users WHERE telegram_id=$1', [userId]);
  if (user.rows[0]?.referred_by) {
    const percent =
      parseFloat(await getSetting('referral_bonus_percent', String(config.referralBonusPercent))) || 10;
    const bonus = (rewardAmount * percent) / 100;
    if (bonus > 0) {
      await updateBalance(user.rows[0].referred_by, bonus, 'referral_bonus', {
        note: `Referral from ${userId} ad #${adId}`,
        referenceId: adId,
        referenceType: 'ad',
        idempotencyKey: idempotencyKey('ref_bonus', adId, userId),
      });
      await pool.query(
        `UPDATE referrals SET bonus_paid = bonus_paid + $1 WHERE referrer_id=$2 AND referred_id=$3`,
        [bonus, user.rows[0].referred_by, userId]
      );
    }
  }
  return { reward: rewardAmount };
}

async function setAdStatus(adId, status, adminNote) {
  await pool.query(
    `UPDATE ads SET status=$1, admin_note=COALESCE($2, admin_note), updated_at=NOW() WHERE id=$3`,
    [status, adminNote || null, adId]
  );
  return getAd(adId);
}

module.exports = {
  createAd,
  getAvailableAdForUser,
  startAdView,
  completeAdView,
  setAdStatus,
  listMyAds,
  getAd,
};
