const { pool } = require('../database');
const { updateBalance } = require('./userService');
const { getSetting } = require('./settingsService');

async function createAd({ ownerId, title, description, url, type, reward, budget, maxViews, durationSec }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query('SELECT balance FROM users WHERE telegram_id = $1 FOR UPDATE', [ownerId]);
    if (!u.rows[0] || parseFloat(u.rows[0].balance) < budget) throw new Error('Insufficient balance for ad budget');

    // Deduct budget
    const newBal = parseFloat(u.rows[0].balance) - budget;
    await client.query('UPDATE users SET balance = $1, updated_at = NOW() WHERE telegram_id = $2', [newBal, ownerId]);

    const res = await client.query(
      `INSERT INTO ads (owner_id, title, description, url, type, reward, budget, max_views, duration_sec, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending') RETURNING *`,
      [ownerId, title, description || null, url, type || 'website', reward, budget, maxViews || null, durationSec || 15]
    );

    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, reference_type, note)
       VALUES ($1, 'ad_spend', $2, $3, $4, 'ad', 'Ad budget reserved')`,
      [ownerId, -budget, newBal, res.rows[0].id]
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

async function getActiveAds(limit = 20) {
  const res = await pool.query(
    `SELECT a.*, u.username as owner_username
     FROM ads a JOIN users u ON a.owner_id = u.telegram_id
     WHERE a.status = 'active' AND (a.max_views IS NULL OR a.views_done < a.max_views)
       AND a.spent + a.reward <= a.budget
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function getAvailableAdForUser(userId) {
  const res = await pool.query(
    `SELECT a.* FROM ads a
     WHERE a.status = 'active'
       AND (a.max_views IS NULL OR a.views_done < a.max_views)
       AND a.spent + a.reward <= a.budget
       AND a.owner_id != $1
       AND NOT EXISTS (SELECT 1 FROM ad_views av WHERE av.ad_id = a.id AND av.user_id = $1)
     ORDER BY RANDOM() LIMIT 1`,
    [userId]
  );
  return res.rows[0] || null;
}

async function completeAdView(adId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const adRes = await client.query('SELECT * FROM ads WHERE id = $1 FOR UPDATE', [adId]);
    if (!adRes.rows[0] || adRes.rows[0].status !== 'active') throw new Error('Ad not available');
    const ad = adRes.rows[0];

    // Already viewed?
    const exists = await client.query('SELECT 1 FROM ad_views WHERE ad_id = $1 AND user_id = $2', [adId, userId]);
    if (exists.rows[0]) throw new Error('Already viewed this ad');

    if (ad.max_views && ad.views_done >= ad.max_views) throw new Error('Ad finished');
    if (parseFloat(ad.spent) + parseFloat(ad.reward) > parseFloat(ad.budget)) throw new Error('Ad budget exhausted');

    // Record view
    await client.query(
      `INSERT INTO ad_views (ad_id, user_id, reward) VALUES ($1, $2, $3)`,
      [adId, userId, ad.reward]
    );

    // Update ad
    const newSpent = parseFloat(ad.spent) + parseFloat(ad.reward);
    const newViews = ad.views_done + 1;
    let newStatus = ad.status;
    if ((ad.max_views && newViews >= ad.max_views) || newSpent + parseFloat(ad.reward) > parseFloat(ad.budget)) {
      newStatus = 'finished';
    }
    await client.query(
      `UPDATE ads SET spent = $1, views_done = $2, status = $3, updated_at = NOW() WHERE id = $4`,
      [newSpent, newViews, newStatus, adId]
    );

    await client.query('COMMIT');

    // Credit user outside transaction for clarity
    await updateBalance(userId, parseFloat(ad.reward), 'ad_reward', `Viewed ad #${adId}`, adId, 'ad');

    // Referral bonus
    const user = await pool.query('SELECT referred_by FROM users WHERE telegram_id = $1', [userId]);
    if (user.rows[0]?.referred_by) {
      const percent = parseFloat(await getSetting('referral_bonus_percent', '10')) || 10;
      const bonus = (parseFloat(ad.reward) * percent) / 100;
      if (bonus > 0) {
        await updateBalance(user.rows[0].referred_by, bonus, 'referral_bonus', `Referral from user ${userId} ad view`, adId, 'ad');
        await pool.query(
          `UPDATE referrals SET bonus_paid = bonus_paid + $1 WHERE referrer_id = $2 AND referred_id = $3`,
          [bonus, user.rows[0].referred_by, userId]
        );
      }
    }

    return { reward: ad.reward, ad };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function setAdStatus(adId, status, adminNote = null) {
  await pool.query(
    `UPDATE ads SET status = $1, admin_note = COALESCE($2, admin_note), updated_at = NOW() WHERE id = $3`,
    [status, adminNote, adId]
  );
}

module.exports = {
  createAd,
  getActiveAds,
  getAvailableAdForUser,
  completeAdView,
  setAdStatus,
};
