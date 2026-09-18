const { isAdmin } = require('../../utils/helpers');
const { adminMenu, depositActions, withdrawalActions } = require('../../keyboards/admin');
const { approveDeposit, rejectDeposit, approveWithdrawal, rejectWithdrawal, addTreasuryTransaction } = require('../../services/financeService');
const { setAdStatus } = require('../../services/adService');
const { getUser, banUser, unbanUser } = require('../../services/userService');
const { getSetting, setSetting } = require('../../services/settingsService');
const { pool } = require('../../database');
const { formatUsd } = require('../../utils/helpers');
const { logger } = require('../../utils/logger');

function adminOnly(ctx, next) {
  if (!isAdmin(ctx.from?.id)) return; // silent ignore for non-admins
  return next();
}

function registerAdminHandlers(bot) {
  // Admin menu commands (only work for admins)
  bot.hears('📥 Pending Deposits', adminOnly, async (ctx) => {
    const res = await pool.query(
      `SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.telegram_id
       WHERE d.status = 'pending' ORDER BY d.created_at ASC LIMIT 10`
    );
    if (!res.rows.length) return ctx.reply('No pending deposits.', adminMenu());
    for (const d of res.rows) {
      await ctx.reply(
        `📥 Deposit #${d.id}\nUser: ${d.user_id} @${d.username || 'n/a'}\nAmount: ${d.amount} USDT\nNetwork: ${d.network}\nTx: ${d.tx_hash || 'n/a'}`,
        depositActions(d.id)
      );
    }
  });

  bot.hears('📤 Pending Withdrawals', adminOnly, async (ctx) => {
    const res = await pool.query(
      `SELECT w.*, u.username FROM withdrawals w JOIN users u ON w.user_id = u.telegram_id
       WHERE w.status = 'pending' ORDER BY w.created_at ASC LIMIT 10`
    );
    if (!res.rows.length) return ctx.reply('No pending withdrawals.', adminMenu());
    for (const w of res.rows) {
      await ctx.reply(
        `📤 Withdrawal #${w.id}\nUser: ${w.user_id} @${w.username || 'n/a'}\nAmount: ${w.amount} USDT\nNetwork: ${w.network}\nAddress: ${w.address}`,
        withdrawalActions(w.id)
      );
    }
  });

  bot.hears('📊 Stats', adminOnly, async (ctx) => {
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const bal = await pool.query('SELECT COALESCE(SUM(balance),0) FROM users');
    const pendingDep = await pool.query(`SELECT COUNT(*) FROM deposits WHERE status='pending'`);
    const pendingWd = await pool.query(`SELECT COUNT(*) FROM withdrawals WHERE status='pending'`);
    const treasury = await getSetting('treasury_balance', '0');
    const text =
      `📊 *Platform Stats*\n\n` +
      `Users: ${users.rows[0].count}\n` +
      `Total user balances: ${formatUsd(bal.rows[0].coalesce)}\n` +
      `Pending deposits: ${pendingDep.rows[0].count}\n` +
      `Pending withdrawals: ${pendingWd.rows[0].count}\n` +
      `Treasury (Trust): ${formatUsd(treasury)}`;
    await ctx.replyWithMarkdown(text, adminMenu());
  });

  bot.hears('🏦 Treasury', adminOnly, async (ctx) => {
    const tb = await getSetting('treasury_balance', '0');
    const addr = await getSetting('trust_wallet_address', '');
    await ctx.replyWithMarkdown(
      `🏦 *Treasury / Trust Wallet*\n\nBalance: *${formatUsd(tb)}*\nAddress: \`${addr || 'Not set'}\`\n\nManage detailed transactions in the Web Admin CMS.`,
      adminMenu()
    );
  });

  bot.hears('⚙️ Settings', adminOnly, async (ctx) => {
    await ctx.reply('Use the Web Admin CMS for full settings control.\n' + (process.env.APP_URL || 'http://localhost:3000') + '/admin', adminMenu());
  });

  bot.hears('🔍 Search User', adminOnly, async (ctx) => {
    ctx.session = { step: 'adm_search' };
    await ctx.reply('Send Telegram ID or username to search:');
  });

  bot.on('text', adminOnly, async (ctx, next) => {
    if (ctx.session?.step !== 'adm_search') return next();
    const q = ctx.message.text.trim().replace('@', '');
    let user;
    if (/^\d+$/.test(q)) {
      user = await getUser(Number(q));
    } else {
      const res = await pool.query('SELECT * FROM users WHERE username ILIKE $1 LIMIT 1', [q]);
      user = res.rows[0];
    }
    ctx.session = {};
    if (!user) return ctx.reply('User not found.', adminMenu());
    await ctx.replyWithMarkdown(
      `User \`${user.telegram_id}\`\n@${user.username || 'n/a'}\nBalance: ${formatUsd(user.balance)}\nBanned: ${user.is_banned ? 'YES – ' + (user.ban_reason || '') : 'No'}\nJoined: ${user.created_at}`,
      adminMenu()
    );
  });

  // Deposit actions
  bot.action(/^adm_dep_ok:(\d+)$/, adminOnly, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    try {
      const dep = await approveDeposit(id, ctx.from.id);
      await ctx.answerCbQuery('Approved');
      await ctx.editMessageText(`✅ Deposit #${id} approved – ${dep.amount} USDT credited to user ${dep.user_id}`);
      try {
        await ctx.telegram.sendMessage(dep.user_id, `✅ Your deposit #${id} of ${dep.amount} USDT has been approved and credited!`);
      } catch (_) {}
    } catch (e) {
      await ctx.answerCbQuery(e.message, { show_alert: true });
    }
  });

  bot.action(/^adm_dep_no:(\d+)$/, adminOnly, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    try {
      const dep = await rejectDeposit(id, ctx.from.id, 'Rejected by admin');
      await ctx.answerCbQuery('Rejected');
      await ctx.editMessageText(`❌ Deposit #${id} rejected`);
      try {
        await ctx.telegram.sendMessage(dep.user_id, `❌ Your deposit #${id} was rejected. Contact support if needed.`);
      } catch (_) {}
    } catch (e) {
      await ctx.answerCbQuery(e.message, { show_alert: true });
    }
  });

  // Withdrawal actions
  bot.action(/^adm_wd_ok:(\d+)$/, adminOnly, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    ctx.session = { step: 'adm_wd_tx', wdId: id };
    await ctx.answerCbQuery();
    await ctx.reply(`Send the TxID / hash after you paid withdrawal #${id} (or type "none"):`);
  });

  bot.on('text', adminOnly, async (ctx, next) => {
    if (ctx.session?.step !== 'adm_wd_tx') return next();
    const txHash = ctx.message.text.trim().toLowerCase() === 'none' ? null : ctx.message.text.trim();
    try {
      const wd = await approveWithdrawal(ctx.session.wdId, ctx.from.id, txHash);
      ctx.session = {};
      await ctx.reply(`✅ Withdrawal #${wd.id} marked as PAID. User notified.`);
      try {
        await ctx.telegram.sendMessage(
          wd.user_id,
          `✅ Your withdrawal #${wd.id} of ${wd.amount} USDT has been paid!\nTx: ${txHash || 'see support'}`
        );
      } catch (_) {}
    } catch (e) {
      ctx.session = {};
      await ctx.reply(`Error: ${e.message}`);
    }
  });

  bot.action(/^adm_wd_no:(\d+)$/, adminOnly, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    try {
      const wd = await rejectWithdrawal(id, ctx.from.id, 'Rejected by admin');
      await ctx.answerCbQuery('Rejected & refunded');
      await ctx.editMessageText(`❌ Withdrawal #${id} rejected – balance refunded`);
      try {
        await ctx.telegram.sendMessage(wd.user_id, `❌ Your withdrawal #${id} was rejected. Funds returned to balance.`);
      } catch (_) {}
    } catch (e) {
      await ctx.answerCbQuery(e.message, { show_alert: true });
    }
  });

  // Ad moderation
  bot.action(/^adm_ad_ok:(\d+)$/, adminOnly, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    await setAdStatus(id, 'active');
    await ctx.answerCbQuery('Activated');
    await ctx.editMessageText(`✅ Ad #${id} is now ACTIVE`);
  });

  bot.action(/^adm_ad_no:(\d+)$/, adminOnly, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    await setAdStatus(id, 'rejected', 'Rejected by admin');
    await ctx.answerCbQuery('Rejected');
    await ctx.editMessageText(`❌ Ad #${id} rejected`);
  });
}

module.exports = { registerAdminHandlers };
