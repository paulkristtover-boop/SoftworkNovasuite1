const pool = require('../database/pool');
const { ValidationError } = require('../utils/errors');
const ads = require('./ads');
const { logAudit } = require('./audit');

/**
 * Apply referral: credit referrer (signup bonus) + new user (welcome bonus).
 * Returns amounts so callers can notify users & admins.
 */
async function applyReferral(referredUserId, code) {
  const settings = await ads.getSettings();
  const referrerBonus = Number(settings.referral_signup_bonus ?? 0.05);
  const welcomeBonus = Number(settings.referral_welcome_bonus ?? 0.02);

  const clean = String(code || '')
    .trim()
    .replace(/^ref_/i, '');
  if (!clean) throw new ValidationError('Invalid referral code.');

  const { rows: refRows } = await pool.query(
    `SELECT * FROM users WHERE UPPER(referral_code) = UPPER($1)`,
    [clean]
  );
  const referrer = refRows[0];
  if (!referrer) throw new ValidationError('Invalid referral code.');
  if (Number(referrer.id) === Number(referredUserId)) {
    throw new ValidationError('You cannot refer yourself.');
  }

  const { rows: me } = await pool.query(`SELECT * FROM users WHERE id = $1`, [referredUserId]);
  const user = me[0];
  if (!user) throw new ValidationError('User not found.');
  if (user.referred_by) throw new ValidationError('You already used a referral code.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE users SET referred_by = $1, updated_at = NOW() WHERE id = $2 AND referred_by IS NULL`, [
      referrer.id,
      referredUserId,
    ]);
    const check = await client.query(`SELECT referred_by FROM users WHERE id = $1`, [referredUserId]);
    if (Number(check.rows[0]?.referred_by) !== Number(referrer.id)) {
      throw new ValidationError('You already used a referral code.');
    }

    if (referrerBonus > 0) {
      await client.query(
        `UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
        [referrerBonus, referrer.id]
      );
      await client.query(
        `INSERT INTO referral_rewards (referrer_id, referred_id, reward_type, amount)
         VALUES ($1, $2, 'signup', $3)`,
        [referrer.id, referredUserId, referrerBonus]
      );
    }

    // Welcome bonus for the new joiner
    if (welcomeBonus > 0) {
      await client.query(
        `UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
        [welcomeBonus, referredUserId]
      );
      await client.query(
        `INSERT INTO referral_rewards (referrer_id, referred_id, reward_type, amount)
         VALUES ($1, $2, 'welcome', $3)`,
        [referrer.id, referredUserId, welcomeBonus]
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await logAudit({
    actorUserId: referredUserId,
    action: 'referral.apply',
    entityType: 'user',
    entityId: String(referredUserId),
    details: {
      referrerId: referrer.id,
      referrerBonus,
      welcomeBonus,
      code: clean,
    },
  });

  return {
    referrer,
    referrerBonus,
    welcomeBonus,
    bonus: referrerBonus, // legacy alias
  };
}

async function payEarnShare(client, referredUserId, earnAmount) {
  const { rows } = await client.query(`SELECT referred_by FROM users WHERE id = $1`, [referredUserId]);
  const referredBy = rows[0]?.referred_by;
  if (!referredBy) return 0;

  const settings = await ads.getSettings();
  const pct = Number(settings.referral_earn_percent ?? 5);
  if (pct <= 0) return 0;
  const share = Math.round(Number(earnAmount) * (pct / 100) * 1e8) / 1e8;
  if (share <= 0) return 0;

  await client.query(
    `UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
    [share, referredBy]
  );
  await client.query(
    `INSERT INTO referral_rewards (referrer_id, referred_id, reward_type, amount)
     VALUES ($1, $2, 'earn_share', $3)`,
    [referredBy, referredUserId, share]
  );
  return share;
}

async function referralStats(userId) {
  const { rows: count } = await pool.query(
    `SELECT COUNT(*)::int AS referred FROM users WHERE referred_by = $1`,
    [userId]
  );
  const { rows: rewards } = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total FROM referral_rewards WHERE referrer_id = $1`,
    [userId]
  );
  return {
    referred: count[0].referred,
    totalRewards: rewards[0].total,
  };
}

async function listReferrals(userId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT telegram_id, username, first_name, created_at, total_earned
     FROM users WHERE referred_by = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function listRecentReferralRewards(limit = 30) {
  const { rows } = await pool.query(
    `SELECT r.*, 
      u1.telegram_id AS referrer_tg, u1.username AS referrer_username,
      u2.telegram_id AS referred_tg, u2.username AS referred_username, u2.first_name AS referred_name
     FROM referral_rewards r
     JOIN users u1 ON u1.id = r.referrer_id
     JOIN users u2 ON u2.id = r.referred_id
     ORDER BY r.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

module.exports = {
  applyReferral,
  payEarnShare,
  referralStats,
  listReferrals,
  listRecentReferralRewards,
};
