const cron = require('node-cron');
const logger = require('../utils/logger');
const pool = require('../database/pool');
const { notifyAdmins } = require('../services/notify');
const { money } = require('../utils/format');

/**
 * Periodic jobs — reminders for pending items, health checks.
 */
function startJobs(bot) {
  // Every 6 hours: remind admins of pending queue
  cron.schedule('0 */6 * * *', async () => {
    try {
      const { rows } = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM deposits WHERE status = 'pending') AS d,
          (SELECT COUNT(*)::int FROM withdrawals WHERE status = 'pending') AS w
      `);
      const { d, w } = rows[0];
      if (d > 0 || w > 0) {
        await notifyAdmins(
          bot,
          `⏰ <b>Pending queue reminder</b>\n\n📥 Deposits: ${d}\n📤 Withdrawals: ${w}\n\nOpen Admin menu → Pending.`
        );
      }
    } catch (err) {
      logger.error(`[jobs] pending reminder: ${err.message}`);
    }
  });

  // Daily trust wallet snapshot (log only)
  cron.schedule('0 9 * * *', async () => {
    try {
      const { rows } = await pool.query('SELECT balance, label FROM trust_wallet LIMIT 1');
      if (rows[0]) {
        logger.info(`[jobs] Trust wallet ${rows[0].label}: ${money(rows[0].balance)}`);
      }
    } catch (err) {
      logger.error(`[jobs] snapshot: ${err.message}`);
    }
  });

  logger.info('[jobs] Cron jobs scheduled');
}

module.exports = { startJobs };
