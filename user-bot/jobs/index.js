const cron = require('node-cron');
const logger = require('../../shared/utils/logger');
const pool = require('../../shared/database/pool');
const { notifyAdmins } = require('../../shared/services/notify');

/**
 * Periodic jobs — reminders for pending items.
 */
function startJobs(_bot) {
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
          `⏰ <b>Pending queue reminder</b>\n\n📥 Deposits: ${d}\n📤 Withdrawals: ${w}\n\nOpen the Admin CMS to review.`
        );
      }
    } catch (err) {
      logger.error(`[jobs] pending reminder: ${err.message}`);
    }
  });

  logger.info('[jobs] Scheduled');
}

module.exports = { startJobs };
