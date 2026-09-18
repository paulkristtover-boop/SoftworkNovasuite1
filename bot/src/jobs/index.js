const cron = require('node-cron');
const { pool } = require('../database');
const { logger } = require('../utils/logger');

function startJobs(bot) {
  // Daily cleanup of old sessions / soft expired ads etc.
  cron.schedule('0 3 * * *', async () => {
    try {
      await pool.query(`UPDATE ads SET status = 'finished' WHERE status = 'active' AND max_views IS NOT NULL AND views_done >= max_views`);
      logger.info('Daily job: expired ads closed');
    } catch (e) {
      logger.error('Job error', e);
    }
  });

  logger.info('Background jobs started');
}

module.exports = { startJobs };
