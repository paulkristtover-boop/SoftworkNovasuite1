const { pool } = require('../database');
const { generateReferralCode } = require('../utils/helpers');
const { logger } = require('../utils/logger');

async function findOrCreateUser(from, referralCode = null) {
  const client = await pool.connect();
  try {
    let res = await client.query('SELECT * FROM users WHERE telegram_id = $1', [from.id]);
    if (res.rows[0]) {
      await client.query(
        `UPDATE users SET username = $1, first_name = $2, last_name = $3,
         language_code = $4, last_active_at = NOW(), updated_at = NOW()
         WHERE telegram_id = $5`,
        [from.username || null, from.first_name || null, from.last_name || null, from.language_code || 'en', from.id]
      );
      return (await client.query('SELECT * FROM users WHERE telegram_id = $1', [from.id])).rows[0];
    }

    // New user
    const code = generateReferralCode(from.id);
    let referredBy = null;
    if (referralCode) {
      const ref = await client.query('SELECT telegram_id FROM users WHERE referral_code = $1', [referralCode]);
      if (ref.rows[0] && ref.rows[0].telegram_id !== from.id) {
        referredBy = ref.rows[0].telegram_id;
      }
    }

    res = await client.query(
      `INSERT INTO users (telegram_id, username, first_name, last_name, language_code, referral_code, referred_by, last_active_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [from.id, from.username || null, from.first_name || null, from.last_name || null, from.language_code || 'en', code, referredBy]
    );

    const user = res.rows[0];

    if (referredBy) {
      await client.query(
        `INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [referredBy, from.id]
      );
    }

    return user;
  } finally {
    client.release();
  }
}

async function getUser(telegramId) {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
  return res.rows[0] || null;
}

async function updateBalance(telegramId, delta, type, note = null, referenceId = null, referenceType = null, createdBy = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query('SELECT balance FROM users WHERE telegram_id = $1 FOR UPDATE', [telegramId]);
    if (!u.rows[0]) throw new Error('User not found');
    const newBal = parseFloat(u.rows[0].balance) + parseFloat(delta);
    if (newBal < -0.00000001) throw new Error('Insufficient balance');

    await client.query(
      `UPDATE users SET balance = $1, updated_at = NOW(),
       total_earned = total_earned + CASE WHEN $2 > 0 THEN $2 ELSE 0 END,
       total_withdrawn = total_withdrawn + CASE WHEN $2 < 0 AND $3 = 'withdrawal' THEN ABS($2) ELSE 0 END
       WHERE telegram_id = $4`,
      [newBal, delta, type, telegramId]
    );

    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, reference_type, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [telegramId, type, delta, newBal, referenceId, referenceType, note, createdBy]
    );

    await client.query('COMMIT');
    return newBal;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function banUser(telegramId, reason, adminId) {
  await pool.query(
    `UPDATE users SET is_banned = TRUE, ban_reason = $1, updated_at = NOW() WHERE telegram_id = $2`,
    [reason, telegramId]
  );
  await pool.query(
    `INSERT INTO audit_logs (actor_id, actor_type, action, target_type, target_id, details)
     VALUES ($1, 'admin', 'ban_user', 'user', $2, $3)`,
    [adminId, String(telegramId), JSON.stringify({ reason })]
  );
}

async function unbanUser(telegramId, adminId) {
  await pool.query(
    `UPDATE users SET is_banned = FALSE, ban_reason = NULL, updated_at = NOW() WHERE telegram_id = $1`,
    [telegramId]
  );
  await pool.query(
    `INSERT INTO audit_logs (actor_id, actor_type, action, target_type, target_id)
     VALUES ($1, 'admin', 'unban_user', 'user', $2)`,
    [adminId, String(telegramId)]
  );
}

async function getReferralStats(telegramId) {
  const count = await pool.query('SELECT COUNT(*) FROM referrals WHERE referrer_id = $1', [telegramId]);
  const bonus = await pool.query('SELECT COALESCE(SUM(bonus_paid),0) as total FROM referrals WHERE referrer_id = $1', [telegramId]);
  return {
    count: parseInt(count.rows[0].count, 10),
    totalBonus: parseFloat(bonus.rows[0].total),
  };
}

module.exports = {
  findOrCreateUser,
  getUser,
  updateBalance,
  banUser,
  unbanUser,
  getReferralStats,
};
