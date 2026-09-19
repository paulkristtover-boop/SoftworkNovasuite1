const { pool } = require('../database');
const { generateReferralCode } = require('../utils/helpers');
const { audit } = require('../utils/audit');

async function findOrCreateUser(from, referralCode = null) {
  const existing = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [from.id]);
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE users SET username=$1, first_name=$2, last_name=$3, language_code=$4, last_active_at=NOW(), updated_at=NOW()
       WHERE telegram_id=$5`,
      [from.username || null, from.first_name || null, from.last_name || null, from.language_code || 'en', from.id]
    );
    return (await pool.query('SELECT * FROM users WHERE telegram_id=$1', [from.id])).rows[0];
  }

  const code = generateReferralCode(from.id);
  let referredBy = null;
  if (referralCode) {
    const ref = await pool.query('SELECT telegram_id FROM users WHERE referral_code=$1', [referralCode]);
    if (ref.rows[0] && ref.rows[0].telegram_id !== from.id) referredBy = ref.rows[0].telegram_id;
  }

  const res = await pool.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name, language_code, referral_code, referred_by, last_active_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
    [from.id, from.username || null, from.first_name || null, from.last_name || null, from.language_code || 'en', code, referredBy]
  );
  if (referredBy) {
    await pool.query(
      `INSERT INTO referrals (referrer_id, referred_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [referredBy, from.id]
    );
  }
  return res.rows[0];
}

async function getUser(telegramId) {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id=$1', [telegramId]);
  return res.rows[0] || null;
}

/**
 * Balance change with idempotency — same key returns existing result, no double-credit.
 */
async function updateBalance(telegramId, delta, type, { note, referenceId, referenceType, createdBy, idempotencyKey } = {}) {
  if (idempotencyKey) {
    const existing = await pool.query('SELECT * FROM transactions WHERE idempotency_key=$1', [idempotencyKey]);
    if (existing.rows[0]) return { balance: existing.rows[0].balance_after, duplicate: true };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query('SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE', [telegramId]);
    if (!u.rows[0]) throw new Error('User not found');
    const newBal = parseFloat(u.rows[0].balance) + parseFloat(delta);
    if (newBal < -0.00000001) throw new Error('Insufficient balance');

    await client.query(
      `UPDATE users SET balance=$1, updated_at=NOW(),
       total_earned = total_earned + CASE WHEN $2 > 0 THEN $2 ELSE 0 END,
       total_withdrawn = total_withdrawn + CASE WHEN $2 < 0 AND $3 = 'withdrawal' THEN ABS($2) ELSE 0 END
       WHERE telegram_id=$4`,
      [newBal, delta, type, telegramId]
    );

    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, reference_type, note, created_by, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [telegramId, type, delta, newBal, referenceId || null, referenceType || null, note || null, createdBy || null, idempotencyKey || null]
    );
    await client.query('COMMIT');
    return { balance: newBal, duplicate: false };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function banUser(telegramId, reason, adminId) {
  await pool.query(`UPDATE users SET is_banned=TRUE, ban_reason=$1, updated_at=NOW() WHERE telegram_id=$2`, [reason, telegramId]);
  await audit({ actorId: adminId, action: 'ban_user', targetType: 'user', targetId: telegramId, details: { reason } });
}

async function unbanUser(telegramId, adminId) {
  await pool.query(`UPDATE users SET is_banned=FALSE, ban_reason=NULL, updated_at=NOW() WHERE telegram_id=$1`, [telegramId]);
  await audit({ actorId: adminId, action: 'unban_user', targetType: 'user', targetId: telegramId });
}

async function getReferralStats(telegramId) {
  const c = await pool.query('SELECT COUNT(*) FROM referrals WHERE referrer_id=$1', [telegramId]);
  const b = await pool.query('SELECT COALESCE(SUM(bonus_paid),0) AS t FROM referrals WHERE referrer_id=$1', [telegramId]);
  return { count: parseInt(c.rows[0].count, 10), totalBonus: parseFloat(b.rows[0].t) };
}

module.exports = { findOrCreateUser, getUser, updateBalance, banUser, unbanUser, getReferralStats };
