const { getUser, getReferralStats } = require('../../services/userService');
const { formatUsd } = require('../../utils/helpers');
const { mainMenu } = require('../../keyboards/user');
const { block, SEP, tip, errorMsg } = require('../../utils/ui');
const config = require('../../config');

module.exports = function referralHandler(bot) {
  bot.hears('👥 Refer', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply(errorMsg('Please tap /start first.'), mainMenu());

    const stats = await getReferralStats(ctx.from.id);
    const link = `https://t.me/${ctx.botInfo.username}?start=${user.referral_code}`;

    const text = block([
      '👥 *Referral program*',
      SEP,
      `Earn *${config.referralBonusPercent}%* of your friends' ad rewards — forever.`,
      '',
      `• Your code: \`${user.referral_code}\``,
      `• Invited: *${stats.count}*`,
      `• Bonus earned: *${formatUsd(stats.totalBonus)}*`,
      '',
      '*Your invite link*',
      `\`${link}\``,
      '',
      tip('Share the link — they must open it to join under you'),
    ]);

    await ctx.replyWithMarkdown(text, mainMenu());
  });
};
