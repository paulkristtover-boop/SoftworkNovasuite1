const cron = require('node-cron');
const { pool } = require('../database');
const { logger } = require('../utils/logger');
const config = require('../config');

function startJobs(bot) {
  // Close expired ads daily
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

  // Monitoring heartbeat every 15 min
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

  logger.info('Background jobs started');
}

module.exports = { startJobs };
