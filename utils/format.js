const dayjs = require('dayjs');
const config = require('../config');

function money(amount, currency = config.app.currency) {
  const n = Number(amount);
  if (Number.isNaN(n)) return `0.00 ${currency}`;
  return `${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })} ${currency}`;
}

function shortId(uuid) {
  if (!uuid) return '—';
  return String(uuid).slice(0, 8);
}

function dt(value) {
  if (!value) return '—';
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function userLabel(user) {
  if (!user) return 'Unknown';
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'User';
  const un = user.username ? `@${user.username}` : `id:${user.telegram_id || user.id}`;
  return `${name} (${un})`;
}

function statusEmoji(status) {
  const map = {
    pending: '⏳',
    approved: '✅',
    rejected: '❌',
    paid: '💸',
    cancelled: '🚫',
    new: '🆕',
    reviewed: '👁',
    implemented: '✨',
    closed: '📁',
  };
  return map[status] || '•';
}

module.exports = {
  money,
  shortId,
  dt,
  escapeHtml,
  userLabel,
  statusEmoji,
};
