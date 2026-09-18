const { v4: uuidv4 } = require('uuid');
const config = require('../config');

function generateReferralCode(telegramId) {
  const base = telegramId.toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `NVS${base}${rand}`;
}

function formatAmount(amount, decimals = 4) {
  const n = parseFloat(amount) || 0;
  return n.toFixed(decimals).replace(/\.?0+$/, '') || '0';
}

function formatUsd(amount) {
  return `${config.currencySymbol}${formatAmount(amount, 4)} ${config.currency}`;
}

function isAdmin(telegramId) {
  return config.adminIds.includes(Number(telegramId));
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str, len = 100) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  generateReferralCode,
  formatAmount,
  formatUsd,
  isAdmin,
  escapeHtml,
  truncate,
  sleep,
  uuidv4,
};
