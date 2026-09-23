const users = require('../services/users');
const config = require('../config');
const { BannedError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Ensures user exists in DB, attaches ctx.state.user, blocks banned users
 * (except admins can still use admin flows).
 */
async function authMiddleware(ctx, next) {
  if (!ctx.from) return next();

  try {
    const user = await users.upsertUser(ctx.from);
    ctx.state.user = user;
    ctx.state.isAdmin =
      user.role === 'admin' || config.adminIds.includes(Number(ctx.from.id));

    // Ban check — admins bypass
    if (user.is_banned && !ctx.state.isAdmin) {
      const reason = user.ban_reason || 'Your account has been restricted. Contact support.';
      await ctx.reply(`🚫 <b>Access restricted</b>\n\n${reason}`, { parse_mode: 'HTML' });
      return;
    }

    return next();
  } catch (err) {
    logger.error(`[auth] ${err.message}`);
    if (err instanceof BannedError) {
      await ctx.reply(`🚫 ${err.message}`);
      return;
    }
    await ctx.reply('Something went wrong. Please try again later.');
  }
}

function requireAdmin(ctx, next) {
  if (!ctx.state.isAdmin) {
    return ctx.reply('⛔ Admin only.');
  }
  return next();
}

function requireTerms(ctx, next) {
  if (ctx.state.isAdmin) return next();
  if (ctx.state.user && !ctx.state.user.accepted_terms) {
    return ctx.reply(
      '📄 Please accept the Terms of Use before continuing.\n\nTap <b>📄 Terms</b> in the menu.',
      { parse_mode: 'HTML' }
    );
  }
  return next();
}

module.exports = { authMiddleware, requireAdmin, requireTerms };
