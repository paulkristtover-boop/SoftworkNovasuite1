const cron = require('node-cron');
const { pool } = require('../database');
const { logger } = require('../utils/logger');
const config = require('../config');
const { communityLinks, checkCommunityMembership } = require('../services/membershipService');
const { joinKeyboard } = require('../keyboards/user');

function startJobs(bot) {
  cron.schedule('0 3 * * *', async () => {
    try {
      await pool.query(
        `UPDATE ads SET status='finished' WHERE status='active' AND max_views IS NOT NULL AND views_done >= max_views`
      );
      await pool.query(
        `UPDATE ads SET status='finished' WHERE status='active' AND spent + reward > budget`
      );
      logger.info('Daily jobs: ads cleaned');
    } catch (e) {
      logger.error('Job error', e.message);
    }
  });

  cron.schedule('*/15 * * * *', async () => {
    try {
      await pool.query('SELECT 1');
    } catch (e) {
      logger.error('Health check failed', e.message);
    }
  });

  // Soft join reminders every 6h
  if (config.requireMembership) {
    cron.schedule('0 */6 * * *', async () => {
      try {
        const { channelUrl, groupUrl } = communityLinks();
        let res;
        try {
          res = await pool.query(
            `SELECT telegram_id FROM users
             WHERE COALESCE(is_banned, FALSE) = FALSE
               AND (join_reminded_at IS NULL OR join_reminded_at < NOW() - INTERVAL '20 hours')
             ORDER BY created_at DESC
             LIMIT 40`
          );
        } catch (_) {
          // Columns may be missing without migrate — fallback
          res = await pool.query(
            `SELECT telegram_id FROM users
             WHERE COALESCE(is_banned, FALSE) = FALSE
             ORDER BY created_at DESC LIMIT 20`
          );
        }
        for (const u of res.rows) {
          try {
            const m = await checkCommunityMembership(bot.telegram, u.telegram_id);
            if (m.ok) {
              await pool
                .query(`UPDATE users SET membership_verified=TRUE WHERE telegram_id=$1`, [u.telegram_id])
                .catch(() => {});
              continue;
            }
            await bot.telegram.sendMessage(
              u.telegram_id,
              [
                '📢 *Friendly reminder*',
                '',
                'Join our community when you can:',
                `Channel: ${channelUrl}`,
                `Group: ${groupUrl}`,
                '',
                'Then /start → *Verify membership*.',
                '',
                '_Welcome bonus is credited automatically when you join the bot (first N users)._',
              ].join('\n'),
              { parse_mode: 'Markdown' }
            );
            await pool
              .query(`UPDATE users SET join_reminded_at=NOW() WHERE telegram_id=$1`, [u.telegram_id])
              .catch(() => {});
            await new Promise((r) => setTimeout(r, 50));
          } catch (_) {}
        }
        logger.info(`Join reminders: ${res.rows.length}`);
      } catch (e) {
        logger.error('Join reminder job', e.message);
      }
    });
  }

  logger.info('Background jobs started');
}

module.exports = { startJobs };
