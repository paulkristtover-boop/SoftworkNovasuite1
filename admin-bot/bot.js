/**
 * ADMIN NOTIFICATION BOT
 * Lightweight bot that only receives notifications for admins.
 * Does NOT handle any business logic or admin commands.
 * Admins manage everything in the Vercel CMS.
 */
const { Telegraf } = require('telegraf');
const config = require('../shared/config');
const logger = require('../shared/utils/logger');

if (!config.adminBotToken) {
  console.error('ADMIN_BOT_TOKEN is required');
  process.exit(1);
}

const bot = new Telegraf(config.adminBotToken);

bot.start(async (ctx) => {
  const id = ctx.from.id;
  const isAdmin = config.adminIds.includes(Number(id));
  if (!isAdmin) {
    return ctx.reply('This bot is for internal notifications only.');
  }
  await ctx.reply(
    `🛡 <b>SoftworkNovaSuite Admin Bot</b>\n\n` +
      `You will receive live alerts here for:\n` +
      `• New deposits\n` +
      `• New withdrawals\n` +
      `• Ideas & support messages\n\n` +
      `Manage everything in the Admin CMS` +
      (config.cms.url ? `:\n${config.cms.url}` : '.'),
    { parse_mode: 'HTML' }
  );
});

bot.command('status', async (ctx) => {
  if (!config.adminIds.includes(Number(ctx.from.id))) return;
  await ctx.reply('✅ Admin notification bot is online.');
});

bot.on('message', async (ctx) => {
  if (!config.adminIds.includes(Number(ctx.from.id))) {
    return ctx.reply('This bot is for internal notifications only.');
  }
  await ctx.reply(
    'Use the Admin CMS to manage deposits, withdrawals, users, and treasury.' +
      (config.cms.url ? `\n\n${config.cms.url}` : '')
  );
});

bot.catch((err) => {
  logger.error(`[admin-bot] ${err.message}`);
});

async function main() {
  await bot.telegram.deleteWebhook({ drop_pending_updates: false });
  await bot.launch();
  logger.info('[admin-bot] Notification bot started (long polling)');
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
