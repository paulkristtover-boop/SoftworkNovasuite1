const config = require('../config');
const hits = new Map();

function rateLimit(ctx, next) {
  if (!ctx.from) return next();
  const key = ctx.from.id;
  const now = Date.now();
  let e = hits.get(key);
  if (!e || now - e.start > config.rateLimitWindowMs) e = { start: now, count: 0 };
  e.count += 1;
  hits.set(key, e);
  if (e.count > config.rateLimitMax) {
    return ctx.reply('⏳ Slow down. Please wait a few seconds.').catch(() => {});
  }
  return next();
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.start > config.rateLimitWindowMs * 5) hits.delete(k);
}, 60000);

module.exports = { rateLimit };
