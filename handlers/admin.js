const adminKb = require('../keyboards/admin');
const userKb = require('../keyboards/user');
const config = require('../config');
const { money, shortId, dt, statusEmoji, escapeHtml, userLabel } = require('../utils/format');
const deposits = require('../services/deposits');
const withdrawals = require('../services/withdrawals');
const payments = require('../services/payments');
const treasury = require('../services/treasury');
const ideas = require('../services/ideas');
const users = require('../services/users');
const { notifyUser } = require('../services/notify');
const session = require('../utils/session');
const pool = require('../database/pool');
const { ValidationError } = require('../utils/errors');

async function dashboard(ctx) {
  const tw = await treasury.getTrustWallet();
  const { rows: counts } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM deposits WHERE status = 'pending') AS pending_deps,
      (SELECT COUNT(*)::int FROM withdrawals WHERE status = 'pending') AS pending_wds,
      (SELECT COUNT(*)::int FROM users) AS users_count,
      (SELECT COALESCE(SUM(balance),0) FROM users) AS user_balances,
      (SELECT COUNT(*)::int FROM ideas WHERE status = 'new') AS new_ideas
  `);
  const c = counts[0];

  const text =
    `📊 <b>Admin Dashboard</b>\n\n` +
    `🏦 Trust Wallet: <b>${money(tw ? tw.balance : 0)}</b>\n` +
    `👥 Users: ${c.users_count}\n` +
    `💵 Sum of user balances: ${money(c.user_balances)}\n\n` +
    `⏳ Pending deposits: <b>${c.pending_deps}</b>\n` +
    `⏳ Pending withdrawals: <b>${c.pending_wds}</b>\n` +
    `💡 New ideas: ${c.new_ideas}\n\n` +
    `<i>Treasury shows funds available for owner withdrawal (accounting). ` +
    `Pay user withdrawals manually from the Trust Wallet.</i>`;

  await ctx.reply(text, { parse_mode: 'HTML', ...adminKb.adminMenu() });
}

async function pendingDeposits(ctx) {
  const list = await deposits.listPendingDeposits(15);
  if (!list.length) {
    return ctx.reply('✅ No pending deposits.', adminKb.adminMenu());
  }
  await ctx.reply(`⏳ <b>Pending deposits (${list.length})</b>`, {
    parse_mode: 'HTML',
    ...adminKb.adminMenu(),
  });
  for (const d of list) {
    const text =
      `📥 <b>Deposit</b> #${shortId(d.id)}\n` +
      `User: ${d.first_name || ''} ${d.username ? '@' + d.username : d.telegram_id}\n` +
      `Amount: <b>${money(d.amount)}</b>\n` +
      `Network: ${d.network || '—'}\n` +
      `TX: <code>${escapeHtml(d.tx_hash || '')}</code>\n` +
      `When: ${dt(d.created_at)}\n` +
      `ID: <code>${d.id}</code>`;
    await ctx.reply(text, { parse_mode: 'HTML', ...adminKb.depositReview(d.id) });
  }
}

async function pendingWithdrawals(ctx) {
  const list = await withdrawals.listPendingWithdrawals(15);
  if (!list.length) {
    return ctx.reply('✅ No pending withdrawals.', adminKb.adminMenu());
  }
  await ctx.reply(
    `⏳ <b>Pending withdrawals (${list.length})</b>\n` +
      `<i>Pay from Trust Wallet, then Mark Paid.</i>`,
    { parse_mode: 'HTML', ...adminKb.adminMenu() }
  );
  for (const w of list) {
    const text =
      `📤 <b>Withdrawal</b> #${shortId(w.id)}\n` +
      `User: ${w.first_name || ''} ${w.username ? '@' + w.username : w.telegram_id}\n` +
      `Amount: <b>${money(w.amount)}</b>\n` +
      `Network: ${w.network}\n` +
      `Address: <code>${escapeHtml(w.to_address)}</code>\n` +
      `When: ${dt(w.created_at)}\n` +
      `ID: <code>${w.id}</code>`;
    await ctx.reply(text, { parse_mode: 'HTML', ...adminKb.withdrawalReview(w.id) });
  }
}

async function trustWalletView(ctx) {
  const tw = await treasury.getTrustWallet();
  const ledger = await treasury.listLedger(10);
  let text =
    `🏦 <b>${tw ? tw.label : 'Trust Wallet'}</b>\n\n` +
    `Balance: <b>${money(tw ? tw.balance : 0)}</b>\n` +
    `Updated: ${dt(tw && tw.updated_at)}\n\n` +
    `<b>Recent ledger</b>\n`;
  if (!ledger.length) text += '<i>No movements yet</i>';
  else {
    for (const l of ledger) {
      const sign = l.direction === 'in' ? '+' : '−';
      text += `${sign}${money(l.amount)} · ${l.type} · ${dt(l.created_at)}\n`;
      if (l.note) text += `   <i>${escapeHtml(l.note.slice(0, 80))}</i>\n`;
    }
  }
  text +=
    `\n\nTo record owner withdrawal or balancing:\n` +
    `• Use <b>➕ Ledger Adjust</b>\n` +
    `• Or type: <code>/admin_withdraw AMOUNT note...</code>`;
  await ctx.reply(text, { parse_mode: 'HTML', ...adminKb.adminMenu() });
}

async function paymentAddresses(ctx) {
  const list = await payments.listAllAddresses();
  if (!list.length) {
    await ctx.reply(
      'No payment addresses yet.\nUse:\n<code>/add_address NETWORK ADDRESS label...</code>\nExample:\n<code>/add_address TRC20 TXyz... Main USDT TRC20</code>',
      { parse_mode: 'HTML', ...adminKb.adminMenu() }
    );
    return;
  }
  await ctx.reply(`📍 <b>Payment addresses</b> (${list.length})`, {
    parse_mode: 'HTML',
    ...adminKb.adminMenu(),
  });
  for (const a of list) {
    const text =
      `${a.is_active ? '🟢' : '🔴'} <b>${a.network}</b> · ${a.currency}\n` +
      `Label: ${a.label || '—'}\n` +
      `Address: <code>${escapeHtml(a.address)}</code>\n` +
      `ID: ${a.id}`;
    await ctx.reply(text, { parse_mode: 'HTML', ...adminKb.addressActions(a.id) });
  }
  await ctx.reply(
    'Add new:\n<code>/add_address NETWORK ADDRESS optional label</code>',
    { parse_mode: 'HTML' }
  );
}

async function ideasList(ctx) {
  const list = await ideas.listIdeas(null, 15);
  if (!list.length) return ctx.reply('No ideas yet.', adminKb.adminMenu());
  await ctx.reply(`💡 <b>Ideas</b>`, { parse_mode: 'HTML', ...adminKb.adminMenu() });
  for (const i of list) {
    const text =
      `#${i.id} ${statusEmoji(i.status)} <b>${i.status}</b>\n` +
      `From: ${i.username ? '@' + i.username : i.telegram_id}\n` +
      `${escapeHtml(i.content.slice(0, 400))}\n` +
      `${dt(i.created_at)}`;
    await ctx.reply(text, { parse_mode: 'HTML', ...adminKb.ideaActions(i.id) });
  }
}

async function auditLogs(ctx) {
  const { rows } = await pool.query(
    `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20`
  );
  let text = `📋 <b>Recent audit logs</b>\n\n`;
  for (const r of rows) {
    text += `• ${dt(r.created_at)} · <code>${r.action}</code>`;
    if (r.entity_type) text += ` · ${r.entity_type}:${r.entity_id || ''}`;
    text += `\n`;
  }
  if (!rows.length) text += '<i>Empty</i>';
  await ctx.reply(text, { parse_mode: 'HTML', ...adminKb.adminMenu() });
}

async function banStart(ctx) {
  await session.setSession(ctx.from.id, 'admin_ban', {});
  await ctx.reply(
    'Send Telegram user ID (numeric) or @username to ban/unban.\nFormat:\n<code>ban 123456789 reason</code>\n<code>unban 123456789</code>',
    { parse_mode: 'HTML', ...userKb.cancelKeyboard() }
  );
}

async function ledgerAdjustStart(ctx) {
  await session.setSession(ctx.from.id, 'admin_ledger', {});
  await ctx.reply(
    '➕ <b>Ledger adjust / admin withdraw</b>\n\n' +
      'Format:\n' +
      '<code>out 100 Owner draw</code> — debit Trust Wallet\n' +
      '<code>in 50 Correction</code> — credit Trust Wallet\n\n' +
      'Amounts in USDT. This is for accounting only.',
    { parse_mode: 'HTML', ...userKb.cancelKeyboard() }
  );
}

// Callbacks
async function onDepApprove(ctx) {
  const id = ctx.match[1];
  try {
    const dep = await deposits.approveDeposit(id, ctx.state.user.id, 'Approved via bot');
    await ctx.answerCbQuery('Approved');
    await ctx.editMessageText(
      (ctx.callbackQuery.message.text || '') + `\n\n✅ <b>APPROVED</b> by admin`,
      { parse_mode: 'HTML' }
    );
    await notifyUser(
      ctx,
      dep.telegram_id,
      `✅ <b>Deposit approved</b>\n\nAmount: <b>${money(dep.amount)}</b>\n` +
        `Credited to your balance.\nID: <code>${dep.id}</code>`,
      userKb.mainMenu()
    );
  } catch (e) {
    await ctx.answerCbQuery(e.message || 'Failed', { show_alert: true });
  }
}

async function onDepReject(ctx) {
  const id = ctx.match[1];
  try {
    const dep = await deposits.rejectDeposit(id, ctx.state.user.id, 'Rejected via bot');
    await ctx.answerCbQuery('Rejected');
    await ctx.editMessageText(
      (ctx.callbackQuery.message.text || '') + `\n\n❌ <b>REJECTED</b>`,
      { parse_mode: 'HTML' }
    );
    await notifyUser(
      ctx,
      dep.telegram_id,
      `❌ <b>Deposit rejected</b>\n\nAmount: ${money(dep.amount)}\nID: <code>${dep.id}</code>\n` +
        `Contact support if you believe this is an error.`,
      userKb.mainMenu()
    );
  } catch (e) {
    await ctx.answerCbQuery(e.message || 'Failed', { show_alert: true });
  }
}

async function onWdPay(ctx) {
  const id = ctx.match[1];
  try {
    const w = await withdrawals.approveAndPayWithdrawal(id, ctx.state.user.id, 'Paid via Trust Wallet');
    await ctx.answerCbQuery('Marked paid');
    await ctx.editMessageText(
      (ctx.callbackQuery.message.text || '') + `\n\n💸 <b>PAID</b>`,
      { parse_mode: 'HTML' }
    );
    await notifyUser(
      ctx,
      w.telegram_id,
      `💸 <b>Withdrawal paid</b>\n\nAmount: <b>${money(w.amount)}</b>\n` +
        `Network: ${w.network}\nTo: <code>${escapeHtml(w.to_address)}</code>\n` +
        `ID: <code>${w.id}</code>`,
      userKb.mainMenu()
    );
  } catch (e) {
    await ctx.answerCbQuery(e.message || 'Failed', { show_alert: true });
  }
}

async function onWdReject(ctx) {
  const id = ctx.match[1];
  try {
    const w = await withdrawals.rejectWithdrawal(id, ctx.state.user.id, 'Rejected via bot');
    await ctx.answerCbQuery('Rejected & refunded');
    await ctx.editMessageText(
      (ctx.callbackQuery.message.text || '') + `\n\n❌ <b>REJECTED</b> (balance restored)`,
      { parse_mode: 'HTML' }
    );
    await notifyUser(
      ctx,
      w.telegram_id,
      `❌ <b>Withdrawal rejected</b>\n\nAmount: ${money(w.amount)} restored to balance.\nID: <code>${w.id}</code>`,
      userKb.mainMenu()
    );
  } catch (e) {
    await ctx.answerCbQuery(e.message || 'Failed', { show_alert: true });
  }
}

async function onAddrToggle(ctx) {
  const id = Number(ctx.match[1]);
  try {
    const a = await payments.getAddressById(id);
    if (!a) return ctx.answerCbQuery('Not found', { show_alert: true });
    const updated = await payments.updateAddress(id, { is_active: !a.is_active }, ctx.state.user.id);
    await ctx.answerCbQuery(updated.is_active ? 'Activated' : 'Deactivated');
    await ctx.editMessageText(
      `${updated.is_active ? '🟢' : '🔴'} <b>${updated.network}</b>\n<code>${escapeHtml(updated.address)}</code>\nID: ${updated.id}`,
      { parse_mode: 'HTML', ...adminKb.addressActions(id) }
    );
  } catch (e) {
    await ctx.answerCbQuery(e.message || 'Failed', { show_alert: true });
  }
}

async function onAddrDelete(ctx) {
  const id = Number(ctx.match[1]);
  try {
    await payments.deleteAddress(id, ctx.state.user.id);
    await ctx.answerCbQuery('Deleted');
    await ctx.editMessageText('🗑 Address deleted.');
  } catch (e) {
    await ctx.answerCbQuery(e.message || 'Failed', { show_alert: true });
  }
}

async function onIdeaStatus(ctx) {
  const status = ctx.match[1];
  const id = Number(ctx.match[2]);
  try {
    await ideas.updateIdeaStatus(id, status, null, ctx.state.user.id);
    await ctx.answerCbQuery(`Marked ${status}`);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch (e) {
    await ctx.answerCbQuery(e.message || 'Failed', { show_alert: true });
  }
}

async function handleAdminText(ctx) {
  const text = (ctx.message && ctx.message.text) || '';
  if (text === '❌ Cancel') {
    await session.clearSession(ctx.from.id);
    await ctx.reply('Cancelled.', adminKb.adminMenu());
    return true;
  }

  // Commands that work without session
  if (text.startsWith('/add_address ')) {
    const parts = text.slice('/add_address '.length).trim().split(/\s+/);
    const network = parts[0];
    const address = parts[1];
    const label = parts.slice(2).join(' ') || null;
    if (!network || !address) {
      await ctx.reply('Usage: /add_address NETWORK ADDRESS optional label');
      return true;
    }
    const row = await payments.createAddress({
      network,
      address,
      label,
      isActive: true,
      createdBy: ctx.state.user.id,
    });
    await ctx.reply(
      `✅ Address added (active)\n${row.network}\n<code>${escapeHtml(row.address)}</code>\nID: ${row.id}`,
      { parse_mode: 'HTML', ...adminKb.adminMenu() }
    );
    return true;
  }

  if (text.startsWith('/admin_withdraw ')) {
    const rest = text.slice('/admin_withdraw '.length).trim();
    const [amtStr, ...noteParts] = rest.split(/\s+/);
    const amount = Number(amtStr);
    const note = noteParts.join(' ') || 'Admin withdraw';
    try {
      const tw = await treasury.adminWithdrawFromTrust({
        amount,
        note,
        adminUserId: ctx.state.user.id,
      });
      await ctx.reply(
        `✅ Recorded. Trust Wallet balance: <b>${money(tw.balance)}</b>`,
        { parse_mode: 'HTML', ...adminKb.adminMenu() }
      );
    } catch (e) {
      await ctx.reply(e.message || 'Failed');
    }
    return true;
  }

  const s = ctx.state.session || {};
  if (s.state === 'admin_ban') {
    const lower = text.toLowerCase();
    const m = lower.match(/^(ban|unban)\s+(\d+)(?:\s+(.+))?$/);
    if (!m) {
      await ctx.reply('Format: ban TELEGRAM_ID reason  OR  unban TELEGRAM_ID');
      return true;
    }
    const action = m[1];
    const tid = Number(m[2]);
    const reason = m[3] || null;
    const target = await users.getByTelegramId(tid);
    if (!target) {
      await ctx.reply('User not found in database. They must /start first.');
      return true;
    }
    await users.setBanned(target.id, action === 'ban', reason, ctx.state.user);
    await session.clearSession(ctx.from.id);
    await ctx.reply(
      action === 'ban' ? `🚫 User ${tid} banned.` : `✅ User ${tid} unbanned.`,
      adminKb.adminMenu()
    );
    return true;
  }

  if (s.state === 'admin_ledger') {
    const m = text.trim().match(/^(in|out)\s+([\d.]+)(?:\s+(.+))?$/i);
    if (!m) {
      await ctx.reply('Format: in|out AMOUNT optional note');
      return true;
    }
    try {
      const tw = await treasury.adminAdjust({
        amount: Number(m[2]),
        direction: m[1].toLowerCase(),
        note: m[3] || null,
        adminUserId: ctx.state.user.id,
      });
      await session.clearSession(ctx.from.id);
      await ctx.reply(
        `✅ Ledger updated. Trust Wallet: <b>${money(tw.balance)}</b>`,
        { parse_mode: 'HTML', ...adminKb.adminMenu() }
      );
    } catch (e) {
      await ctx.reply(e.message || 'Failed');
    }
    return true;
  }

  return false;
}

async function switchUserMenu(ctx) {
  await ctx.reply('User menu:', userKb.mainMenu());
}

module.exports = {
  dashboard,
  pendingDeposits,
  pendingWithdrawals,
  trustWalletView,
  paymentAddresses,
  ideasList,
  auditLogs,
  banStart,
  ledgerAdjustStart,
  onDepApprove,
  onDepReject,
  onWdPay,
  onWdReject,
  onAddrToggle,
  onAddrDelete,
  onIdeaStatus,
  handleAdminText,
  switchUserMenu,
};
