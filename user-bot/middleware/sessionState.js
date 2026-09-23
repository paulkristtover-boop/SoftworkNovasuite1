const session = require('../../shared/utils/session');

/**
 * Loads conversation state into ctx.state.session
 */
async function sessionMiddleware(ctx, next) {
  if (!ctx.from) return next();
  const s = await session.getSession(ctx.from.id);
  ctx.state.session = s;
  await next();
}

module.exports = { sessionMiddleware, sessionStateMiddleware: sessionMiddleware };
