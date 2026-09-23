const pool = require('../database/pool');
const { ValidationError } = require('../utils/errors');
const ads = require('./ads');

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function claimDailyBonus(userId) {
  const settings = await ads.getSettings();
  const base = Number(settings.daily_checkin_base ?? 0.01);
  const streakBonus = Number(settings.daily_checkin_streak_bonus ?? 0.002);

  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
  const user = rows[0];
  if (!user) throw new ValidationError('User not found.');

  const now = new Date();
  const today = startOfUtcDay(now);
  if (user.last_checkin_at) {
    const last = startOfUtcDay(new Date(user.last_checkin_at));
    if (last.getTime() === today.getTime()) {
      throw new ValidationError('You already claimed today’s bonus. Come back tomorrow!');
    }
  }

  let streak = 1;
  if (user.last_checkin_at) {
    const last = startOfUtcDay(new Date(user.last_checkin_at));
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    if (last.getTime() === yesterday.getTime()) {
      streak = (Number(user.checkin_streak) || 0) + 1;
    }
  }

  const amount = base + (streak - 1) * streakBonus;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE users SET balance = balance + $1, last_checkin_at = NOW(), checkin_streak = $2, updated_at = NOW()
       WHERE id = $3`,
      [amount, streak, userId]
    );
    await client.query(
      `INSERT INTO daily_bonuses (user_id, amount, streak) VALUES ($1, $2, $3)`,
      [userId, amount, streak]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { amount, streak };
}

module.exports = { claimDailyBonus };
