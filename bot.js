require('dotenv').config();

const { Telegraf, session } = require('telegraf');
const config = require('./config');
const logger = require('./utils/logger');

const { authMiddleware, requireAdmin } = require('./middleware/auth');
const { sessionMiddleware } = require('./middleware/sessionState');
const { loggingMiddleware } = require('./middleware/logging');

const { startHandler } = require('./handlers/start');
const userHandlers = require('./handlers/user');
const adminHandlers = require('./handlers/admin');
const { registerInline } = require('./inline');
const { startJobs } = require('./jobs');
const { startWebhookMode } = require('./webhooks/server');

if (!config.botToken) {
  console.error('BOT_TOKEN is required. Copy .env.example to .env and fill values.');
  process.exit(1);
}

const bot = new Telegraf(config.botToken);

// Global middleware
bot.use(loggingMiddleware);
bot.use(session());
bot.use(sessionMiddleware);
bot.use(authMiddleware);

// ——— Commands ———
bot.start(startHandler);
bot.command('menu', startHandler);
bot.command('balance', userHandlers.balanceHandler);
bot.command('deposit', userHandlers.depositStart);
bot.command('withdraw', userHandlers.withdrawStart);
bot.command('support', userHandlers.supportHandler);
bot.command('terms', userHandlers.termsHandler);
bot.command('privacy', userHandlers.privacyHandler);
bot.command('idea', userHandlers.ideaStart);

bot.command('admin', requireAdmin, adminHandlers.dashboard);
bot.command('dashboard', requireAdmin, adminHandlers.dashboard);

// ——— User reply keyboard ———
bot.hears('💰 Balance', userHandlers.balanceHandler);
bot.hears('📥 Deposit', userHandlers.depositStart);
bot.hears('📤 Withdraw', userHandlers.withdrawStart);
bot.hears('📜 History', userHandlers.historyHandler);
bot.hears('💡 Submit Idea', userHandlers.ideaStart);
bot.hears('🆘 Support', userHandlers.supportHandler);
bot.hears('📄 Terms', userHandlers.termsHandler);
bot.hears('🔒 Privacy', userHandlers.privacyHandler);

// ——— Admin reply keyboard ———
bot.hears('📊 Dashboard', requireAdmin, adminHandlers.dashboard);
bot.hears('⏳ Pending Deposits', requireAdmin, adminHandlers.pendingDeposits);
bot.hears('⏳ Pending Withdrawals', requireAdmin, adminHandlers.pendingWithdrawals);
bot.hears('🏦 Trust Wallet', requireAdmin, adminHandlers.trustWalletView);
bot.hears('📍 Payment Addresses', requireAdmin, adminHandlers.paymentAddresses);
bot.hears('💡 Ideas', requireAdmin, adminHandlers.ideasList);
bot.hears('👤 Ban / Unban', requireAdmin, adminHandlers.banStart);
bot.hears('📋 Audit Logs', requireAdmin, adminHandlers.auditLogs);
bot.hears('➕ Ledger Adjust', requireAdmin, adminHandlers.ledgerAdjustStart);
bot.hears('🏠 User Menu', adminHandlers.switchUserMenu);

// ——— Callbacks ———
bot.action('accept_terms', userHandlers.acceptTermsCallback);
bot.action(/^dep_net:(\d+)$/, userHandlers.onDepositNetwork);
bot.action('dep_cancel', userHandlers.onCancelCb);
bot.action(/^wd_net:(.+)$/, userHandlers.onWithdrawNetwork);
bot.action('wd_cancel', userHandlers.onCancelCb);
bot.action('support_msg', userHandlers.onSupportMsg);

bot.action(/^adm_dep_ok:(.+)$/, requireAdmin, adminHandlers.onDepApprove);
bot.action(/^adm_dep_no:(.+)$/, requireAdmin, adminHandlers.onDepReject);
bot.action(/^adm_wd_ok:(.+)$/, requireAdmin, adminHandlers.onWdPay);
bot.action(/^adm_wd_no:(.+)$/, requireAdmin, adminHandlers.onWdReject);
bot.action(/^adm_addr_toggle:(\d+)$/, requireAdmin, adminHandlers.onAddrToggle);
bot.action(/^adm_addr_del:(\d+)$/, requireAdmin, adminHandlers.onAddrDelete);
bot.action(/^adm_idea:(reviewed|implemented|closed):(\d+)$/, requireAdmin, adminHandlers.onIdeaStatus);

// ——— Text router (sessions + admin commands) ———
bot.on('text', async (ctx) => {
  if (ctx.state.isAdmin) {
    const handled = await adminHandlers.handleAdminText(ctx);
    if (handled) return;
  }
  const handled = await userHandlers.handleTextState(ctx);
  if (!handled) {
    // Unknown text — gentle nudge
    if (!ctx.message.text?.startsWith('/')) {
      await ctx.reply('Use the menu buttons below, or /start', {
        reply_markup: ctx.state.isAdmin
          ? require('./keyboards/admin').adminMenu().reply_markup
          : require('./keyboards/user').mainMenu().reply_markup,
      });
    }
  }
});

registerInline(bot);

bot.catch((err, ctx) => {
  logger.error(`[bot] Unhandled for ${ctx.updateType}: ${err.message}`);
  logger.error(err.stack);
  ctx.reply('Something went wrong. Please try again or contact support.').catch(() => {});
});

async function main() {
  // Ensure DB is reachable
  const pool = require('./database/pool');
  try {
    await pool.query('SELECT 1');
    logger.info('[db] Connected');
  } catch (e) {
    logger.error(`[db] Connection failed: ${e.message}`);
    logger.error('Run migrations: npm run migrate');
  }

  startJobs(bot);

  if (config.webhook.useWebhook && config.webhook.domain) {
    await startWebhookMode(bot);
  } else {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    await bot.launch();
    logger.info('[bot] Started with long polling');
  }

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
