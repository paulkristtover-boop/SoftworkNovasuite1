const config = require('../config');

const hits = new Map();
const WINDOW_MS = config.rateLimitWindowMs || 3000;
const MAX_HITS = config.rateLimitMaxHits || 8;

function rateLimit(ctx, next) {
  if (!ctx.from) return next();
  const key = ctx.from.id;
  const now = Date.now();
  let entry = hits.get(key);
  if (!entry || now - entry.start > WINDOW_MS) {
    entry = { start: now, count: 0 };
  }
  entry.count += 1;
  hits.set(key, entry);

  if (entry.count > MAX_HITS) {
    return ctx.reply('⏳ Slow down a bit. Please wait a few seconds.').catch(() => {});
  }
  return next();
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) {
    if (now - v.start > WINDOW_MS * 5) hits.delete(k);
  }
}, 60000);

module.exports = { rateLimit };
