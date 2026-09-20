/**
 * NovaSuite — Telegraf bot entry
 * Private-chat only. Users + admin notifications. Shares Postgres with admin-cms.
 * Does not interact in Telegram channels or groups.
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
  console.error('[NovaSuite] BOT_TOKEN required');
  process.exit(1);
}

const bot = new Telegraf(config.botToken);
bot.use(privateOnly()); // never handle channel/group messages
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
  logger.error('Telegraf error', err.message);
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
    'Welcome starter credit for the first 30 users — use it to start earning or advertising.',
    '',
    'Community (news & chat — bot does not operate there):',
    'https://t.me/SoftworkNovaSuite',
    'https://t.me/softworknovasuitecommunity',
  ].join('\n');

  const shortDescription = 'Earn & promote with USDT · Private chat bot · Softwork NovaSuite';

  await telegram.setMyDescription(description);
  await telegram.setMyShortDescription(shortDescription);
  await telegram.setMyCommands([
    { command: 'start', description: 'Open NovaSuite (private chat)' },
  ]);

  logger.info('Bot profile updated');
}

async function start() {
  await pool.query('SELECT 1');
  logger.info('PostgreSQL connected');
  startJobs(bot);

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
    await bot.launch();
    logger.info('Bot started (polling, private chats only)');
  }

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

start().catch((e) => {
  logger.error('Start failed', e);
  process.exit(1);
});
