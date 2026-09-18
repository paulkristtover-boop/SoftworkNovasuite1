/**
 * NovaSuite Bot
 * User-facing PTC bot + admin notifications (Telegraf)
 * Shares one PostgreSQL with the Next.js Admin CMS
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('dotenv').config();

const { Telegraf, session } = require('telegraf');
const config = require('./src/config');
const { pool } = require('./src/database');
const { logger } = require('./src/utils/logger');
const { rateLimit } = require('./src/middleware/rateLimit');
const { banCheck } = require('./src/middleware/banCheck');
const { registerUserHandlers } = require('./src/handlers/user');
const { registerAdminHandlers } = require('./src/handlers/admin');
const { registerInline } = require('./src/inline');
const { startJobs } = require('./src/jobs');

if (!config.botToken) {
  console.error('[NovaSuite] BOT_TOKEN is required.');
  process.exit(1);
}
if (!config.databaseUrl && !process.env.PGHOST) {
  console.warn('[NovaSuite] DATABASE_URL not set – ensure Postgres is configured.');
}

const bot = new Telegraf(config.botToken);

bot.use(session());
bot.use(rateLimit);
bot.use(banCheck);
bot.use(async (ctx, next) => {
  ctx.state = ctx.state || {};
  return next();
});

registerUserHandlers(bot);
registerAdminHandlers(bot);
registerInline(bot);

bot.catch((err, ctx) => {
  logger.error(`Telegraf error (${ctx?.updateType}):`, err);
  try {
    ctx.reply('⚠️ Something went wrong. Please try again or contact support.').catch(() => {});
  } catch (_) {}
});

async function start() {
  try {
    await pool.query('SELECT 1');
    logger.info('PostgreSQL connected');

    startJobs(bot);

    if (config.useWebhook && config.webhookUrl) {
      const express = require('express');
      const app = express();
      app.get('/health', (_req, res) => res.json({ ok: true, service: 'novasuite-bot' }));
      app.use(bot.webhookCallback(config.webhookPath));
      await bot.telegram.setWebhook(`${config.webhookUrl}${config.webhookPath}`);
      app.listen(config.botPort, () => {
        logger.info(`Webhook listening on :${config.botPort}${config.webhookPath}`);
      });
    } else {
      await bot.launch();
      logger.info('Bot started (polling mode)');
    }

    if (config.adminCmsUrl) {
      logger.info(`Admin CMS: ${config.adminCmsUrl}`);
    }

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (err) {
    logger.error('Failed to start bot:', err);
    process.exit(1);
  }
}

start();
