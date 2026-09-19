const { pool } = require('../database');
const config = require('../config');

async function recordEvent(userId, eventType, severity = 1, details = {}) {
  await pool.query(
    `INSERT INTO fraud_events (user_id, event_type, severity, details) VALUES ($1,$2,$3,$4)`,
    [userId, eventType, severity, JSON.stringify(details)]
  );
  if (severity >= 3) {
    await pool.query(
      `UPDATE users SET fraud_score = fraud_score + $1, updated_at=NOW() WHERE telegram_id=$2`,
      [severity, userId]
    );
  }
}

async function checkDailyLimits(userId) {
  const views = await pool.query(
    `SELECT COUNT(*) FROM ad_views WHERE user_id=$1 AND completed_at >= NOW() - INTERVAL '1 day' AND verified=TRUE`,
    [userId]
  );
  const earned = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS s FROM transactions
     WHERE user_id=$1 AND type='ad_reward' AND created_at >= NOW() - INTERVAL '1 day'`,
    [userId]
  );
  const viewCount = parseInt(views.rows[0].count, 10);
  const earnSum = parseFloat(earned.rows[0].s);
  if (viewCount >= config.maxDailyAdViews) {
    await recordEvent(userId, 'daily_view_limit', 2, { viewCount });
    return { ok: false, reason: `Daily ad view limit (${config.maxDailyAdViews}) reached.` };
  }
  if (earnSum >= config.maxDailyEarn) {
    await recordEvent(userId, 'daily_earn_limit', 2, { earnSum });
    return { ok: false, reason: `Daily earn limit (${config.maxDailyEarn} USDT) reached.` };
  }
  return { ok: true };
}

async function checkCooldown(userId) {
  const last = await pool.query(
    `SELECT completed_at FROM ad_views WHERE user_id=$1 AND verified=TRUE ORDER BY completed_at DESC LIMIT 1`,
    [userId]
  );
  if (last.rows[0]?.completed_at) {
    const elapsed = (Date.now() - new Date(last.rows[0].completed_at).getTime()) / 1000;
    if (elapsed < config.adViewCooldownSec) {
      return { ok: false, reason: `Wait ${Math.ceil(config.adViewCooldownSec - elapsed)}s before next ad.` };
    }
  }
  return { ok: true };
}

module.exports = { recordEvent, checkDailyLimits, checkCooldown };
