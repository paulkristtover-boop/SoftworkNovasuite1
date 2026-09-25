const { checkCommunityMembership, communityLinks } = require('../services/membershipService');
const { isAdmin } = require('../utils/helpers');
const config = require('../config');
const { block, SEP, tip } = require('../utils/ui');
const { joinKeyboard } = require('../keyboards/user');

/**
 * Soft by default: one reminder per session, then allow use.
 * Set STRICT_MEMBERSHIP=true to hard-block until verified.
 */
function requireMembership() {
  return async (ctx, next) => {
    if (!config.requireMembership) return next();
    if (!ctx.from) return next();
    if (isAdmin(ctx.from.id)) return next();

    const text = ctx.message?.text || '';
    if (text.startsWith('/start')) return next();

    const cb = ctx.callbackQuery?.data || '';
    if (cb === 'verify_join' || cb === 'go_home' || cb === 'cancel') return next();

    const strict = process.env.STRICT_MEMBERSHIP === 'true';

    try {
      const result = await checkCommunityMembership(ctx.telegram, ctx.from.id);
      if (result.ok) return next();

      const msg = block([
        strict ? '🔒 *Join required*' : '📢 *Community reminder*',
        SEP,
        result.channel.ok ? '✅ Channel — joined' : '❌ Channel — *not joined yet*',
        result.group.ok ? '✅ Group — joined' : '❌ Group — *not joined yet*',
        '',
        'Join channel + group, then *Verify membership*.',
        strict
          ? tip('Required to use the bot')
          : tip('You can still use the bot — welcome bonus is automatic on join'),
      ]);

      if (strict) {
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery('Join channel & group first', { show_alert: true }).catch(() => {});
        }
        await ctx.replyWithMarkdown(msg, joinKeyboard());
        return;
      }

      // Soft: remind once per session
      ctx.session = ctx.session || {};
      if (!ctx.session.joinReminded) {
        ctx.session.joinReminded = true;
        try {
          await ctx.replyWithMarkdown(msg, joinKeyboard());
        } catch (_) {}
      }
      return next();
    } catch (_) {
      return next();
    }
  };
}

module.exports = { requireMembership };
