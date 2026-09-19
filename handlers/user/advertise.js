const { getUser } = require('../../services/userService');
const { formatUsd } = require('../../utils/helpers');
const { cancelInline } = require('../../keyboards/user');
module.exports = function advertiseHandler(bot) {
  bot.hears('📢 Advertise', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Please /start first.');
    ctx.session = { step: 'ad_title' };
    await ctx.reply(`📢 *Create Ad*\nBalance: ${formatUsd(user.balance)}\n\nSend title:`, { parse_mode: 'Markdown', ...cancelInline() });
  });
  bot.action(/^adtype:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.session?.ad) return;
    ctx.session.ad.type = ctx.match[1];
    ctx.session.step = 'ad_reward';
    await ctx.reply(`Type: *${ctx.match[1]}*\nReward per view (USDT):`, { parse_mode: 'Markdown', ...cancelInline() });
  });
};
