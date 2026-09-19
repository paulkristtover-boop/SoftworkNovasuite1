const crypto = require('crypto');
const config = require('../config');

function generateReferralCode(telegramId) {
  const base = telegramId.toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
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

function idempotencyKey(...parts) {
  return crypto.createHash('sha256').update(parts.filter(Boolean).join(':')).digest('hex').slice(0, 32);
}

function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(String(ip) + (process.env.ADMIN_CMS_SECRET || 'salt')).digest('hex').slice(0, 32);
}

module.exports = {
  generateReferralCode,
  formatAmount,
  formatUsd,
  isAdmin,
  idempotencyKey,
  randomToken,
  hashIp,
};
