const pool = require('../database/pool');
const { BannedError } = require('../utils/errors');
const config = require('../config');

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function ensureReferralCode(userId) {
  const { rows } = await pool.query(`SELECT referral_code FROM users WHERE id = $1`, [userId]);
  if (rows[0]?.referral_code) return rows[0].referral_code;
  for (let i = 0; i < 5; i++) {
    const code = genCode();
    try {
      await pool.query(`UPDATE users SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL`, [
        code,
        userId,
      ]);
      return code;
    } catch (_) {
      /* collision */
    }
  }
  return null;
}

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
  const user = rows[0];
  if (!user.referral_code) {
    await ensureReferralCode(user.id);
    return getByTelegramId(telegramId);
  }
  return user;
}

async function getByTelegramId(telegramId) {
  const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
  return rows[0] || null;
}

async function getById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function getByReferralCode(code) {
  if (!code) return null;
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE UPPER(referral_code) = UPPER($1)`,
    [String(code).trim()]
  );
  return rows[0] || null;
}

async function assertNotBanned(user) {
  if (user && user.is_banned) {
    throw new BannedError(user.ban_reason || 'Your account has been restricted. Contact support.');
  }
}

async function setBanned(userId, banned, reason) {
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
  const q = client || pool;
  const { rows } = await q.query(
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

/** Level from total_earned thresholds */
function calcLevel(totalEarned) {
  const e = Number(totalEarned) || 0;
  if (e >= 100) return 5;
  if (e >= 50) return 4;
  if (e >= 20) return 3;
  if (e >= 5) return 2;
  return 1;
}

const LEVEL_LABELS = {
  1: 'Starter',
  2: 'Bronze',
  3: 'Silver',
  4: 'Gold',
  5: 'Diamond',
};

async function bumpEarnings(client, userId, amount) {
  const { rows } = await client.query(
    `UPDATE users SET
       total_earned = total_earned + $1,
       total_views = total_views + 1,
       level = $2,
       updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [amount, 1, userId] // level fixed below
  );
  const u = rows[0];
  if (!u) return null;
  const level = calcLevel(u.total_earned);
  if (level !== Number(u.level)) {
    await client.query(`UPDATE users SET level = $1 WHERE id = $2`, [level, userId]);
    u.level = level;
  }
  return u;
}

module.exports = {
  upsertUser,
  getByTelegramId,
  getById,
  getByReferralCode,
  ensureReferralCode,
  assertNotBanned,
  setBanned,
  acceptTerms,
  adjustBalance,
  calcLevel,
  LEVEL_LABELS,
  bumpEarnings,
};
