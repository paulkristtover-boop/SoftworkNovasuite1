const logger = require('../utils/logger');

async function loggingMiddleware(ctx, next) {
  const start = Date.now();
  const from = ctx.from ? `${ctx.from.id}` : 'unknown';
  const type = ctx.updateType || 'update';
  try {
    await next();
  } finally {
    const ms = Date.now() - start;
    if (ms > 2000) {
      logger.warn(`[slow] ${type} from ${from} ${ms}ms`);
    }
  }
}

module.exports = { loggingMiddleware };
