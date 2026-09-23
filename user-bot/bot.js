/**
 * SoftworkNovaSuite — single Telegram bot
 * User side: deposit, withdraw, balance, ideas, support, terms
 * Admin side: notifications only (management is in Web Admin CMS on Vercel)
 */
const { Telegraf, session } = require('telegraf');
const config = require('../shared/config');
const logger = require('../shared/utils/logger');
const { authMiddleware, requireTerms } = require('./middleware/auth');
const { sessionMiddleware } = require('./middleware/sessionState');
const { loggingMiddleware } = require('./middleware/logging');
const { startHandler } = require('./handlers/start');
const userHandlers = require('./handlers/user');
const { startJobs } = require('./jobs');

if (!config.botToken) {
  console.error('BOT_TOKEN is required');
  process.exit(1);
}

const bot = new Telegraf(config.botToken);

bot.use(loggingMiddleware);
bot.use(session());
bot.use(authMiddleware);
bot.use(sessionMiddleware);

// Commands
bot.start(startHandler);
bot.command('balance', requireTerms, userHandlers.balanceHandler);
bot.command('deposit', requireTerms, userHandlers.depositStart);
bot.command('withdraw', requireTerms, userHandlers.withdrawStart);
bot.command('history', requireTerms, userHandlers.historyHandler);
bot.command('support', userHandlers.supportHandler);
bot.command('idea', requireTerms, userHandlers.ideaStart);
bot.command('terms', userHandlers.termsHandler);

// Reply keyboard hears
bot.hears(['💵 Earn', 'Earn'], requireTerms, userHandlers.earnStart);
bot.hears(['🎁 Daily Bonus', 'Daily Bonus'], requireTerms, userHandlers.dailyBonusHandler);
bot.hears(['👥 Referrals', 'Referrals'], requireTerms, userHandlers.referralsHandler);
bot.hears(['🏆 Leaderboard', 'Leaderboard'], requireTerms, userHandlers.leaderboardHandler);
bot.hears(['📢 Advertise', 'Advertise'], requireTerms, userHandlers.advertiseStart);
bot.hears(['📊 My Ads', 'My Ads'], requireTerms, userHandlers.myAdsHandler);
bot.hears(['💰 Balance', 'Balance'], requireTerms, userHandlers.balanceHandler);
bot.hears(['📥 Deposit', 'Deposit'], requireTerms, userHandlers.depositStart);
bot.hears(['📤 Withdraw', 'Withdraw'], requireTerms, userHandlers.withdrawStart);
bot.hears(['📜 History', 'History'], requireTerms, userHandlers.historyHandler);
bot.hears(['💡 Submit Idea', 'Submit Idea', 'Idea'], requireTerms, userHandlers.ideaStart);
bot.hears(['🆘 Support', 'Support'], userHandlers.supportHandler);
bot.hears(['📄 Terms', 'Terms'], userHandlers.termsHandler);
bot.hears(['🔒 Privacy', 'Privacy'], userHandlers.privacyHandler);
bot.hears(['❌ Cancel', 'Cancel'], userHandlers.onCancel);

// Callbacks
bot.action('accept_terms', userHandlers.acceptTermsCallback);
bot.action(/^dep_net:(\d+)$/, requireTerms, userHandlers.onDepositNetwork);
bot.action('dep_cancel', userHandlers.onCancelCb);
bot.action(/^wd_net:(.+)$/, requireTerms, userHandlers.onWithdrawNetwork);
bot.action('wd_cancel', userHandlers.onCancelCb);
bot.action('support_msg', userHandlers.onSupportMsg);
bot.action(/^ad_type:(.+)$/, requireTerms, userHandlers.onAdType);
bot.action(/^ad_open:(.+)$/, requireTerms, userHandlers.onAdOpen);
bot.action(/^ad_claim:(.+)$/, requireTerms, userHandlers.onAdClaim);
bot.action('ad_skip', requireTerms, userHandlers.onAdSkip);
bot.action('ad_cancel', userHandlers.onAdCancel);

// Text state machine
bot.on('text', async (ctx) => {
  const handled = await userHandlers.handleTextState(ctx);
  if (!handled && !ctx.message.text?.startsWith('/')) {
    await ctx.reply('Use the menu buttons below, or /start', {
      reply_markup: require('./keyboards/user').mainMenu().reply_markup,
    });
  }
});

bot.catch((err, ctx) => {
  logger.error(`[bot] Unhandled ${ctx.updateType}: ${err.message}`);
  logger.error(err.stack);
  ctx.reply('Something went wrong. Please try again or contact support.').catch(() => {});
});

async function main() {
  const pool = require('../shared/database/pool');
  try {
    await pool.query('SELECT 1');
    logger.info('[db] Connected');
  } catch (e) {
    logger.error(`[db] Connection failed: ${e.message}`);
    logger.error('Run: npm run migrate');
  }

  startJobs(bot);

  if (config.webhook.useWebhook && config.webhook.domain) {
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.get('/health', (_req, res) => res.json({ ok: true, bot: 'user' }));
    app.use(bot.webhookCallback(config.webhook.path));
    await bot.telegram.setWebhook(`${config.webhook.domain}${config.webhook.path}`);
    app.listen(config.webhook.port, () => {
      logger.info(`[bot] Webhook on :${config.webhook.port}${config.webhook.path}`);
    });
  } else {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    await bot.launch();
    logger.info('[bot] Started (long polling)');
  }

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
