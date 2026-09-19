const { getUser } = require('../services/userService');
const config = require('../config');

async function banCheck(ctx, next) {
  if (!ctx.from) return next();
  try {
    const user = await getUser(ctx.from.id);
    if (user?.is_banned) {
      return ctx.reply(
        `🚫 Your account is banned.\n${user.ban_reason ? `Reason: ${user.ban_reason}\n` : ''}Contact support if this is a mistake.`
      );
    }
    if (user && user.fraud_score >= 20) {
      return ctx.reply('⚠️ Account restricted due to suspicious activity. Contact support.');
    }
  } catch (_) {}
  return next();
}

module.exports = { banCheck };
