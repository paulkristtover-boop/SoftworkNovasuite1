const { pool } = require('../database');
const { updateBalance } = require('./userService');
const { getSetting } = require('./settingsService');
const { checkDailyLimits, checkCooldown, recordEvent } = require('./fraudService');
const { randomToken, idempotencyKey } = require('../utils/helpers');
const config = require('../config');

async function createAd({ ownerId, title, description, url, type, reward, budget, maxViews, durationSec }) {
  const minR = config.minAdReward || 0.005;
  const maxR = config.maxAdReward || 1;
  if (!(reward >= minR && reward <= maxR)) {
    throw new Error(`Reward must be between ${minR} and ${maxR} USDT`);
  }
  if (!(budget >= reward)) throw new Error('Budget must cover at least one view');
  const feePct = config.adPlatformFeePercent || 0;
  const fee = Math.round(budget * feePct) / 100 / 100 * 100; // keep simple
  const feeAmount = Math.round(budget * (feePct / 100) * 1e6) / 1e6;
  const totalDebit = budget + feeAmount;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query('SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE', [ownerId]);
    if (!u.rows[0] || parseFloat(u.rows[0].balance) < totalDebit) throw new Error(`Insufficient balance (need ${totalDebit} USDT incl. ${feePct}% fee)`);
    const count = await client.query(
      `SELECT COUNT(*) FROM ads WHERE owner_id=$1 AND status IN ('pending','active','paused')`,
      [ownerId]
    );
    if (parseInt(count.rows[0].count, 10) >= config.maxAdsPerUser) throw new Error('Too many active ads');
    const newBal = parseFloat(u.rows[0].balance) - totalDebit;
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
      [ownerId, -totalDebit, newBal, res.rows[0].id, idempotencyKey('ad_spend', res.rows[0].id)]
    );
    if (feeAmount > 0) {
      const tb = await client.query(`SELECT value FROM settings WHERE key='treasury_balance'`);
      const tbal = (parseFloat(tb.rows[0]?.value || '0') || 0) + feeAmount;
      await client.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('treasury_balance',$1,NOW())
         ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
        [String(tbal)]
      );
      await client.query(
        `INSERT INTO treasury_logs (type, amount, balance_after, note)
         VALUES ('in',$1,$2,$3)`,
        [feeAmount, tbal, `Ad platform fee #${res.rows[0].id}`]
      );
    }
    await client.query('COMMIT');
    return { ...res.rows[0], platformFee: feeAmount, totalDebit };
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
    `SELECT * FROM ads WHERE owner_id=$1 AND status <> 'deleted' ORDER BY created_at DESC LIMIT $2`,
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


async function assertOwner(adId, ownerId) {
  const ad = await getAd(adId);
  if (!ad) throw new Error('Campaign not found');
  if (String(ad.owner_id) !== String(ownerId)) throw new Error('Not your campaign');
  return ad;
}

async function topUpBudget(adId, ownerId, amount) {
  const amt = parseFloat(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Invalid top-up amount');
  const feePct = config.adPlatformFeePercent || 0;
  const feeAmount = Math.round(amt * (feePct / 100) * 1e6) / 1e6;
  const totalDebit = amt + feeAmount;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const adRes = await client.query(`SELECT * FROM ads WHERE id=$1 FOR UPDATE`, [adId]);
    if (!adRes.rows[0]) throw new Error('Campaign not found');
    const ad = adRes.rows[0];
    if (String(ad.owner_id) !== String(ownerId)) throw new Error('Not your campaign');
    if (['rejected', 'deleted'].includes(ad.status)) throw new Error('Cannot top up this campaign');

    const u = await client.query(`SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE`, [ownerId]);
    if (!u.rows[0] || parseFloat(u.rows[0].balance) < totalDebit) {
      throw new Error(`Insufficient balance (need ${totalDebit} USDT incl. fee)`);
    }
    const newBal = parseFloat(u.rows[0].balance) - totalDebit;
    await client.query(`UPDATE users SET balance=$1, updated_at=NOW() WHERE telegram_id=$2`, [newBal, ownerId]);
    const newBudget = parseFloat(ad.budget) + amt;
    let status = ad.status;
    if (status === 'finished' || status === 'paused') status = status === 'finished' ? 'pending' : status;
    // if finished from budget, reopen as active if was active-like
    if (ad.status === 'finished') status = 'pending';

    await client.query(
      `UPDATE ads SET budget=$1, status=$2, updated_at=NOW() WHERE id=$3`,
      [newBudget, status, adId]
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, reference_type, note, idempotency_key)
       VALUES ($1,'ad_topup',$2,$3,$4,'ad','Campaign top-up',$5)`,
      [ownerId, -totalDebit, newBal, adId, idempotencyKey('ad_topup', adId, Date.now())]
    );
    if (feeAmount > 0) {
      const tb = await client.query(`SELECT value FROM settings WHERE key='treasury_balance'`);
      const tbal = (parseFloat(tb.rows[0]?.value || '0') || 0) + feeAmount;
      await client.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('treasury_balance',$1,NOW())
         ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
        [String(tbal)]
      );
    }
    await client.query('COMMIT');
    return { ...(await getAd(adId)), topUp: amt, feeAmount, totalDebit };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function pauseAd(adId, ownerId) {
  const ad = await assertOwner(adId, ownerId);
  if (ad.status !== 'active') throw new Error('Only active campaigns can be paused');
  await pool.query(`UPDATE ads SET status='paused', updated_at=NOW() WHERE id=$1`, [adId]);
  return getAd(adId);
}

async function resumeAd(adId, ownerId) {
  const ad = await assertOwner(adId, ownerId);
  if (ad.status !== 'paused') throw new Error('Only paused campaigns can be resumed');
  await pool.query(`UPDATE ads SET status='active', updated_at=NOW() WHERE id=$1`, [adId]);
  return getAd(adId);
}

async function deleteAd(adId, ownerId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const adRes = await client.query(`SELECT * FROM ads WHERE id=$1 FOR UPDATE`, [adId]);
    if (!adRes.rows[0]) throw new Error('Campaign not found');
    const ad = adRes.rows[0];
    if (String(ad.owner_id) !== String(ownerId)) throw new Error('Not your campaign');
    if (ad.status === 'deleted') throw new Error('Already deleted');

    const remaining = Math.max(0, parseFloat(ad.budget) - parseFloat(ad.spent));
    if (remaining > 0 && ['pending', 'paused', 'active', 'finished'].includes(ad.status)) {
      const u = await client.query(`SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE`, [ownerId]);
      const newBal = parseFloat(u.rows[0].balance) + remaining;
      await client.query(`UPDATE users SET balance=$1, updated_at=NOW() WHERE telegram_id=$2`, [newBal, ownerId]);
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, reference_type, note, idempotency_key)
         VALUES ($1,'ad_refund',$2,$3,$4,'ad','Unused budget refund on delete',$5)`,
        [ownerId, remaining, newBal, adId, idempotencyKey('ad_refund', adId)]
      );
    }
    await client.query(`UPDATE ads SET status='deleted', updated_at=NOW() WHERE id=$1`, [adId]);
    await client.query('COMMIT');
    return { refunded: remaining };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function updateAd(adId, ownerId, fields) {
  const ad = await assertOwner(adId, ownerId);
  if (['deleted', 'rejected'].includes(ad.status)) throw new Error('Cannot edit this campaign');
  const title = fields.title != null ? String(fields.title).slice(0, 200) : ad.title;
  const url = fields.url != null ? String(fields.url) : ad.url;
  const description = fields.description !== undefined ? fields.description : ad.description;
  // editing live ad may need re-approval for url/title change
  let status = ad.status;
  if (ad.status === 'active' && (fields.url || fields.title)) {
    status = 'pending';
  }
  await pool.query(
    `UPDATE ads SET title=$1, url=$2, description=$3, status=$4, updated_at=NOW() WHERE id=$5`,
    [title, url, description, status, adId]
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
  topUpBudget,
  pauseAd,
  resumeAd,
  deleteAd,
  updateAd,
};
