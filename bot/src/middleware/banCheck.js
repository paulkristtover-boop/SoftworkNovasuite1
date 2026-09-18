const { getUser } = require('../services/userService');
const config = require('../config');

async function banCheck(ctx, next) {
  if (!ctx.from) return next();
  try {
    const user = await getUser(ctx.from.id);
    if (user?.is_banned) {
      const reason = user.ban_reason ? `\nReason: ${user.ban_reason}` : '';
      return ctx.reply(`🚫 ${config.banMessage}${reason}`);
    }
  } catch (_) {}
  return next();
}

module.exports = { banCheck };
