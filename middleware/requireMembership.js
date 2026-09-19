const { checkCommunityMembership, communityLinks } = require('../services/membershipService');
const { isAdmin } = require('../utils/helpers');
const config = require('../config');
const { Markup } = require('telegraf');
const { block, SEP, tip } = require('../utils/ui');

/**
 * Soft-gate: if membership required and user not in channel+group,
 * show join UI (except /start, verify callback, admins).
 */
function requireMembership() {
  return async (ctx, next) => {
    if (!config.requireMembership) return next();
    if (!ctx.from) return next();
    if (isAdmin(ctx.from.id)) return next();

    // Allow start + verify flow
    const text = ctx.message?.text || '';
    if (text.startsWith('/start')) return next();
    if (ctx.callbackQuery?.data === 'verify_join' || ctx.callbackQuery?.data === 'go_home') {
      return next();
    }

    // Skip admin keyboard texts
    const adminLabels = [
      '📥 Pending Deposits',
      '📤 Pending Withdrawals',
      '📊 Stats',
      '🏦 Treasury',
      '⚙️ CMS Link',
      '🔍 Search User',
    ];
    if (adminLabels.includes(text)) return next();

    try {
      const result = await checkCommunityMembership(ctx.telegram, ctx.from.id);
      if (result.ok) return next();

      const { channelUrl, groupUrl } = communityLinks();
      const missing = [];
      if (!result.channel.ok) missing.push('channel');
      if (!result.group.ok) missing.push('group');

      const msg = block([
        '🔒 *Join required*',
        SEP,
        'To use NovaSuite, join our official community first:',
        '',
        !result.channel.ok ? '• Channel — not joined yet' : '• Channel — ✓',
        !result.group.ok ? '• Group — not joined yet' : '• Group — ✓',
        '',
        tip('After joining, tap Verify membership'),
      ]);

      const kb = Markup.inlineKeyboard([
        [Markup.button.url('📢 Join channel', channelUrl)],
        [Markup.button.url('💬 Join group', groupUrl)],
        [Markup.button.callback('✅ Verify membership', 'verify_join')],
      ]);

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery(`Join ${missing.join(' & ')} first`, { show_alert: true }).catch(() => {});
        try {
          await ctx.replyWithMarkdown(msg, kb);
        } catch (_) {}
      } else {
        await ctx.replyWithMarkdown(msg, kb);
      }
      return;
    } catch (e) {
      return next();
    }
  };
}

module.exports = { requireMembership };
