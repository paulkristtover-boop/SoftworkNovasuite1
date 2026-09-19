/**
 * NovaSuite user-facing copy & formatting helpers
 */
const config = require('../config');

const SEP = '────────────────';

function esc(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[');
}

function header(title, subtitle) {
  let s = `*${title}*`;
  if (subtitle) s += `\n${subtitle}`;
  return s;
}

function block(lines) {
  return lines.filter((l) => l != null && l !== '').join('\n');
}

function card(title, rows) {
  // rows: [[label, value], ...]
  const body = rows
    .filter((r) => r && r[1] != null && r[1] !== '')
    .map(([k, v]) => `• *${k}:* ${v}`)
    .join('\n');
  return block([`*${title}*`, SEP, body]);
}

function stepProgress(current, total, label) {
  const filled = '●'.repeat(current);
  const empty = '○'.repeat(Math.max(0, total - current));
  return `Step ${current}/${total}  ${filled}${empty}${label ? `\n${label}` : ''}`;
}

function tip(text) {
  return `_💡 ${text}_`;
}

function success(title, body) {
  return block([`✅ *${title}*`, body]);
}

function warn(title, body) {
  return block([`⚠️ *${title}*`, body]);
}

function errorMsg(text) {
  return `❌ ${text}`;
}

function brandName() {
  return config.platformName || 'NovaSuite';
}

module.exports = {
  SEP,
  esc,
  header,
  block,
  card,
  stepProgress,
  tip,
  success,
  warn,
  errorMsg,
  brandName,
};
