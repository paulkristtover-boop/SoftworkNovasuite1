/**
 * NovaSuite — Telegraf bot entry
 * Users + admin notifications. Shares Postgres with admin-cms.
 */
require('dotenv').config();

const { Telegraf, session } = require('telegraf');
const config = require('./config');
const { pool } = require('./database');
const { logger } = require('./utils/logger');
const { rateLimit } = require('./middleware/rateLimit');
const { banCheck } = require('./middleware/banCheck');
const { registerUserHandlers } = require('./handlers/user');
const { registerAdminHandlers } = require('./handlers/admin');
const { startJobs } = require('./jobs');

if (!config.botToken) {
  console.error('[NovaSuite] BOT_TOKEN required');
  process.exit(1);
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

bot.catch((err, ctx) => {
  logger.error('Telegraf error', err.message);
  try {
    ctx.reply('⚠️ Something went wrong. Try again or contact support.').catch(() => {});
  } catch (_) {}
});

async function start() {
  await pool.query('SELECT 1');
  logger.info('PostgreSQL connected');
  startJobs(bot);

  if (config.useWebhook && config.webhookUrl) {
    const express = require('express');
    const app = express();
    app.get('/health', async (_req, res) => {
      try {
        await pool.query('SELECT 1');
        res.json({ ok: true, service: 'novasuite-bot' });
      } catch {
        res.status(503).json({ ok: false });
      }
    });
    app.use(bot.webhookCallback(config.webhookPath));
    await bot.telegram.setWebhook(`${config.webhookUrl}${config.webhookPath}`);
    app.listen(config.port, () => logger.info(`Webhook :${config.port}${config.webhookPath}`));
  } else {
    await bot.launch();
    logger.info('Bot started (polling)');
  }

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

start().catch((e) => {
  logger.error('Start failed', e);
  process.exit(1);
});
