/**
 * Bot must only interact in private chats — never in channels or groups.
 */
function privateOnly() {
  return async (ctx, next) => {
    const type = ctx.chat?.type;
    if (type && type !== 'private') {
      // Silently ignore community traffic
      return;
    }
    return next();
  };
}

module.exports = { privateOnly };
