const { checkCommunityMembership, communityLinks } = require('../services/membershipService');
const { isAdmin } = require('../utils/helpers');
const config = require('../config');
const { block, SEP, tip } = require('../utils/ui');
const { joinKeyboard } = require('../keyboards/user');

function requireMembership() {
  return async (ctx, next) => {
    if (!config.requireMembership) return next();
    if (!ctx.from) return next();
    if (isAdmin(ctx.from.id)) return next();

    const text = ctx.message?.text || '';
    if (text.startsWith('/start')) return next();

    const cb = ctx.callbackQuery?.data || '';
    if (cb === 'verify_join' || cb === 'go_home' || cb === 'cancel') return next();

    try {
      const result = await checkCommunityMembership(ctx.telegram, ctx.from.id);
      if (result.ok) return next();

      const msg = block([
        '🔒 *Join required to continue*',
        SEP,
        'To use NovaSuite, claim bonuses, and get notifications:',
        '',
        result.channel.ok ? '✅ Channel — joined' : '❌ Channel — *not joined*',
        result.group.ok ? '✅ Group — joined' : '❌ Group — *not joined*',
        '',
        '1. Join channel',
        '2. Join group',
        '3. Tap *Verify membership*',
        '',
        tip('The bot only works in private chat — community is for news & users'),
      ]);

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('Join channel & group first', { show_alert: true }).catch(() => {});
      }
      await ctx.replyWithMarkdown(msg, joinKeyboard());
      return;
    } catch (_) {
      return next();
    }
  };
}

module.exports = { requireMembership };
