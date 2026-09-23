const pool = require('../database/pool');
const { BannedError } = require('../utils/errors');
const config = require('../config');

async function upsertUser(from) {
  const telegramId = from.id;
  const isAdmin = config.adminIds.includes(Number(telegramId));
  const role = isAdmin ? 'admin' : 'user';

  const { rows } = await pool.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name, role, last_active_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       role = CASE WHEN $5 = 'admin' THEN 'admin' ELSE users.role END,
       last_active_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [
      telegramId,
      from.username || null,
      from.first_name || null,
      from.last_name || null,
      role,
    ]
  );
  return rows[0];
}

async function getByTelegramId(telegramId) {
  const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
  return rows[0] || null;
}

async function getById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function assertNotBanned(user) {
  if (user && user.is_banned) {
    throw new BannedError(user.ban_reason || 'Your account has been restricted. Contact support.');
  }
}

async function setBanned(userId, banned, reason, actor) {
  const { rows } = await pool.query(
    `UPDATE users SET is_banned = $1, ban_reason = $2, updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [banned, reason || null, userId]
  );
  return rows[0];
}

async function acceptTerms(userId) {
  await pool.query(
    `UPDATE users SET accepted_terms = TRUE, accepted_terms_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );
}

async function adjustBalance(client, userId, delta) {
  const { rows } = await client.query(
    `UPDATE users SET balance = balance + $1, updated_at = NOW()
     WHERE id = $2 AND balance + $1 >= 0
     RETURNING *`,
    [delta, userId]
  );
  if (!rows[0]) {
    const err = new Error('Insufficient balance or user not found');
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }
  return rows[0];
}

module.exports = {
  upsertUser,
  getByTelegramId,
  getById,
  assertNotBanned,
  setBanned,
  acceptTerms,
  adjustBalance,
};
