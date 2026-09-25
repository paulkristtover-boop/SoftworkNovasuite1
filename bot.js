/**
 * NovaSuite — Telegraf bot entry
 * Private-chat only. Users + admin notifications. Shares Postgres with admin-cms.
 */
require('dotenv').config();

const { Telegraf, session } = require('telegraf');
const config = require('./config');
const { pool } = require('./database');
const { logger } = require('./utils/logger');
const { rateLimit } = require('./middleware/rateLimit');
const { banCheck } = require('./middleware/banCheck');
const { privateOnly } = require('./middleware/privateOnly');
const { requireMembership } = require('./middleware/requireMembership');
const { registerUserHandlers } = require('./handlers/user');
const { registerAdminHandlers } = require('./handlers/admin');
const { startJobs } = require('./jobs');

if (!config.botToken) {
  console.error('[NovaSuite] BOT_TOKEN is required');
  process.exit(1);
}
if (!config.databaseUrl) {
  console.error('[NovaSuite] DATABASE_URL is required');
  process.exit(1);
}

const bot = new Telegraf(config.botToken);

bot.use(privateOnly());
bot.use(session());
bot.use(rateLimit);
bot.use(banCheck);
if (config.requireMembership) {
  bot.use(requireMembership());
}
bot.use(async (ctx, next) => {
  ctx.state = ctx.state || {};
  return next();
});

registerUserHandlers(bot);
registerAdminHandlers(bot);

bot.catch((err, ctx) => {
  logger.error('Telegraf error', err?.message || err);
  try {
    ctx.reply('⚠️ Something went wrong. Try again or contact support.').catch(() => {});
  } catch (_) {}
});

async function setupBotProfile(telegram) {
  const description = [
    'NovaSuite is a paid-to-click (PTC) platform in USDT.',
    '',
    'What this bot can do (private chat only):',
    '• Earn USDT by viewing verified ads',
    '• Promote your bot, website, or channel',
    '• Invite friends and earn referral bonuses',
    '• Deposit and withdraw USDT',
    '• Submit ideas and contact support',
    '',
    'Join the official channel & group, then verify in the bot to unlock access and welcome credit (first 30).',
    '',
    'Channel: https://t.me/SoftworkNovaSuite',
    'Group: https://t.me/softworknovasuitecommunity',
  ].join('\n');

  await telegram.setMyDescription(description);
  await telegram.setMyShortDescription('Earn & promote with USDT · Private chat · Softwork NovaSuite');
  await telegram.setMyCommands([{ command: 'start', description: 'Open NovaSuite (private chat)' }]);
  logger.info('Bot profile updated');
}

async function start() {
  try {
    await pool.query('SELECT 1');
    logger.info('PostgreSQL connected');
  } catch (e) {
    console.error('[NovaSuite] Database connection failed:', e.message);
    process.exit(1);
  }

  try {
    startJobs(bot);
  } catch (e) {
    logger.warn('Jobs failed to start:', e.message);
  }

  try {
    await setupBotProfile(bot.telegram);
  } catch (e) {
    logger.warn('Could not set bot description/commands:', e.message);
  }

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
    // Avoid 409 Conflict if a webhook was left set from a previous deploy
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: false });
      logger.info('Cleared webhook (polling mode)');
    } catch (e) {
      logger.warn('deleteWebhook:', e.message);
    }
    await bot.launch({ dropPendingUpdates: false });
    logger.info('Bot started (polling, private chats only)');
  }

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

start().catch((e) => {
  console.error('[NovaSuite] Start failed:', e);
  process.exit(1);
});
