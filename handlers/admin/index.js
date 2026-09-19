const { isAdmin, formatUsd } = require('../../utils/helpers');
const { adminMenu, depositActions, withdrawalActions } = require('../../keyboards/admin');
const {
  approveDeposit, rejectDeposit, approveWithdrawal, rejectWithdrawal,
} = require('../../services/financeService');
const { setAdStatus } = require('../../services/adService');
const { getUser } = require('../../services/userService');
const { getSetting } = require('../../services/settingsService');
const { pool } = require('../../database');
const config = require('../../config');

function adminOnly(ctx, next) {
  if (!isAdmin(ctx.from?.id)) return;
  return next();
}

function registerAdminHandlers(bot) {
  bot.hears('📥 Pending Deposits', adminOnly, async (ctx) => {
    const res = await pool.query(
      `SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id=u.telegram_id
       WHERE d.status='pending' ORDER BY d.created_at ASC LIMIT 10`
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
      `SELECT w.*, u.username FROM withdrawals w JOIN users u ON w.user_id=u.telegram_id
       WHERE w.status='pending' ORDER BY w.created_at ASC LIMIT 10`
    );
    if (!res.rows.length) return ctx.reply('No pending withdrawals.', adminMenu());
    for (const w of res.rows) {
      await ctx.reply(
        `📤 Withdrawal #${w.id}\nUser: ${w.user_id}\nAmount: ${w.amount} USDT\n${w.network}\n${w.address}`,
        withdrawalActions(w.id)
      );
    }
  });

  bot.hears('📊 Stats', adminOnly, async (ctx) => {
    const [users, bal, pd, pw, tb] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COALESCE(SUM(balance),0) AS s FROM users'),
      pool.query(`SELECT COUNT(*) FROM deposits WHERE status='pending'`),
      pool.query(`SELECT COUNT(*) FROM withdrawals WHERE status='pending'`),
      getSetting('treasury_balance', '0'),
    ]);
    await ctx.replyWithMarkdown(
      `📊 *Stats*\nUsers: ${users.rows[0].count}\nBalances: ${formatUsd(bal.rows[0].s)}\nPending dep: ${pd.rows[0].count}\nPending wd: ${pw.rows[0].count}\nTreasury: ${formatUsd(tb)}`,
      adminMenu()
    );
  });

  bot.hears('🏦 Treasury', adminOnly, async (ctx) => {
    const tb = await getSetting('treasury_balance', '0');
    const addr = await getSetting('trust_wallet_address', config.trustWalletAddress);
    await ctx.replyWithMarkdown(
      `🏦 *Treasury*\nBalance: *${formatUsd(tb)}*\nTrust wallet:\n\`${addr || 'Not set'}\`\n\nManage in CMS: ${config.adminCmsUrl || '—'}`,
      adminMenu()
    );
  });

  bot.hears('⚙️ CMS Link', adminOnly, async (ctx) => {
    await ctx.reply(`Admin CMS:\n${config.adminCmsUrl || 'Set ADMIN_CMS_URL'}`, adminMenu());
  });

  bot.hears('🔍 Search User', adminOnly, async (ctx) => {
    ctx.session = { step: 'adm_search' };
    await ctx.reply('Send Telegram ID or username:');
  });

  bot.on('text', adminOnly, async (ctx, next) => {
    if (ctx.session?.step === 'adm_search') {
      const q = ctx.message.text.trim().replace('@', '');
      let user;
      if (/^\d+$/.test(q)) user = await getUser(Number(q));
      else {
        const r = await pool.query('SELECT * FROM users WHERE username ILIKE $1 LIMIT 1', [q]);
        user = r.rows[0];
      }
      ctx.session = {};
      if (!user) return ctx.reply('Not found.', adminMenu());
      return ctx.replyWithMarkdown(
        `User \`${user.telegram_id}\`\n@${user.username || 'n/a'}\nBal: ${formatUsd(user.balance)}\nBanned: ${user.is_banned ? 'YES' : 'No'}\nFraud score: ${user.fraud_score || 0}`,
        adminMenu()
      );
    }
    if (ctx.session?.step === 'adm_wd_tx') {
      const txHash = ctx.message.text.trim().toLowerCase() === 'none' ? null : ctx.message.text.trim();
      try {
        const wd = await approveWithdrawal(ctx.session.wdId, ctx.from.id, txHash);
        ctx.session = {};
        await ctx.reply(`✅ Withdrawal #${wd.id} marked PAID.`);
        try {
          await ctx.telegram.sendMessage(wd.user_id, `✅ Withdrawal #${wd.id} of ${wd.amount} USDT paid.\nTx: ${txHash || 'see support'}`);
        } catch (_) {}
      } catch (e) {
        ctx.session = {};
        await ctx.reply(`Error: ${e.message}`);
      }
      return;
    }
    return next();
  });

  bot.action(/^adm_dep_ok:(\d+)$/, adminOnly, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    try {
      const dep = await approveDeposit(id, ctx.from.id, {
        checklist: { amount_verified: true, tx_checked: true, source: 'telegram' },
      });
      await ctx.answerCbQuery('Approved');
      await ctx.editMessageText(`✅ Deposit #${id} approved — ${dep.amount} USDT`);
      try { await ctx.telegram.sendMessage(dep.user_id, `✅ Deposit #${id} of ${dep.amount} USDT approved.`); } catch (_) {}
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
      try { await ctx.telegram.sendMessage(dep.user_id, `❌ Deposit #${id} rejected.`); } catch (_) {}
    } catch (e) {
      await ctx.answerCbQuery(e.message, { show_alert: true });
    }
  });

  bot.action(/^adm_wd_ok:(\d+)$/, adminOnly, async (ctx) => {
    ctx.session = { step: 'adm_wd_tx', wdId: parseInt(ctx.match[1], 10) };
    await ctx.answerCbQuery();
    await ctx.reply(`Send TxID after paying withdrawal #${ctx.session.wdId} (or none):`);
  });

  bot.action(/^adm_wd_no:(\d+)$/, adminOnly, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    try {
      const wd = await rejectWithdrawal(id, ctx.from.id, 'Rejected by admin');
      await ctx.answerCbQuery('Rejected & refunded');
      await ctx.editMessageText(`❌ Withdrawal #${id} rejected — refunded`);
      try { await ctx.telegram.sendMessage(wd.user_id, `❌ Withdrawal #${id} rejected. Funds returned.`); } catch (_) {}
    } catch (e) {
      await ctx.answerCbQuery(e.message, { show_alert: true });
    }
  });

  bot.action(/^adm_ad_ok:(\d+)$/, adminOnly, async (ctx) => {
    await setAdStatus(parseInt(ctx.match[1], 10), 'active');
    await ctx.answerCbQuery('Activated');
    await ctx.editMessageText(`✅ Ad #${ctx.match[1]} ACTIVE`);
  });

  bot.action(/^adm_ad_no:(\d+)$/, adminOnly, async (ctx) => {
    await setAdStatus(parseInt(ctx.match[1], 10), 'rejected', 'Rejected by admin');
    await ctx.answerCbQuery('Rejected');
    await ctx.editMessageText(`❌ Ad #${ctx.match[1]} rejected`);
  });
}

module.exports = { registerAdminHandlers };
