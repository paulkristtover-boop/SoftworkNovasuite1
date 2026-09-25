const cron = require('node-cron');
const { pool } = require('../database');
const { logger } = require('../utils/logger');
const config = require('../config');
const { communityLinks } = require('../services/membershipService');
const { checkCommunityMembership } = require('../services/membershipService');

function startJobs(bot) {
  cron.schedule('0 3 * * *', async () => {
    try {
      await pool.query(
        `UPDATE ads SET status='finished' WHERE status='active' AND max_views IS NOT NULL AND views_done >= max_views`
      );
      await pool.query(
        `INSERT INTO health_checks (service, status, detail) VALUES ('jobs','ok','daily cleanup')`
      );
      logger.info('Daily jobs: ads cleaned');
    } catch (e) {
      logger.error('Job error', e.message);
    }
  });

  cron.schedule('*/15 * * * *', async () => {
    try {
      await pool.query('SELECT 1');
      await pool.query(
        `INSERT INTO health_checks (service, status, detail) VALUES ('bot','ok','heartbeat')`
      );
    } catch (e) {
      logger.error('Health check failed', e.message);
    }
  });

  // Remind users who have not verified membership (every 6h, max soft)
  if (config.requireMembership) {
    cron.schedule('0 */6 * * *', async () => {
      try {
        const { channelUrl, groupUrl } = communityLinks();
        const res = await pool.query(
          `SELECT telegram_id FROM users
           WHERE COALESCE(membership_verified, FALSE) = FALSE
             AND COALESCE(is_banned, FALSE) = FALSE
             AND (join_reminded_at IS NULL OR join_reminded_at < NOW() - INTERVAL '20 hours')
           ORDER BY created_at DESC
           LIMIT 40`
        );
        for (const u of res.rows) {
          try {
            const m = await checkCommunityMembership(bot.telegram, u.telegram_id);
            if (m.ok) {
              await pool.query(
                `UPDATE users SET membership_verified=TRUE WHERE telegram_id=$1`,
                [u.telegram_id]
              );
              continue;
            }
            await bot.telegram.sendMessage(
              u.telegram_id,
              [
                '📢 *Friendly reminder*',
                '',
                'Join our community to keep full access to NovaSuite:',
                `Channel: ${channelUrl}`,
                `Group: ${groupUrl}`,
                '',
                'Then open the bot → /start → *Verify membership*.',
                '',
                '_Your welcome bonus (if eligible) is already in your wallet when credited._',
              ].join('\n'),
              { parse_mode: 'Markdown' }
            );
            await pool.query(`UPDATE users SET join_reminded_at=NOW() WHERE telegram_id=$1`, [
              u.telegram_id,
            ]);
            await new Promise((r) => setTimeout(r, 50));
          } catch (_) {}
        }
        logger.info(`Join reminders sent: ${res.rows.length}`);
      } catch (e) {
        logger.error('Join reminder job', e.message);
      }
    });
  }

  logger.info('Background jobs started');
}

module.exports = { startJobs };
