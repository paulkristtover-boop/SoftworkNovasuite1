/**
 * Receipt helpers — format transaction confirmations for users/admins.
 * Extend later with PDF generation if needed.
 */
const { money, shortId, dt, escapeHtml } = require('../utils/format');
const config = require('../config');

function depositReceipt(dep, user) {
  return (
    `🧾 <b>Deposit receipt</b>\n\n` +
    `ID: <code>${dep.id}</code>\n` +
    `Amount: <b>${money(dep.amount)}</b>\n` +
    `Network: ${dep.network || '—'}\n` +
    `TX: <code>${escapeHtml(dep.tx_hash || '')}</code>\n` +
    `Status: ${dep.status}\n` +
    `Date: ${dt(dep.created_at)}\n` +
    (user ? `User: ${user.username ? '@' + user.username : user.telegram_id}\n` : '')
  );
}

function withdrawalReceipt(w, user) {
  return (
    `🧾 <b>Withdrawal receipt</b>\n\n` +
    `ID: <code>${w.id}</code>\n` +
    `Amount: <b>${money(w.amount)}</b>\n` +
    `Network: ${w.network}\n` +
    `To: <code>${escapeHtml(w.to_address)}</code>\n` +
    `Status: ${w.status}\n` +
    `Date: ${dt(w.created_at)}\n` +
    (w.paid_at ? `Paid: ${dt(w.paid_at)}\n` : '') +
    (user ? `User: ${user.username ? '@' + user.username : user.telegram_id}\n` : '')
  );
}

module.exports = { depositReceipt, withdrawalReceipt };
