const { getUser, getReferralStats } = require('../../services/userService');
const { formatUsd } = require('../../utils/helpers');
const { mainMenu } = require('../../keyboards/user');
const config = require('../../config');

module.exports = function referralHandler(bot) {
  bot.hears('👥 Referrals', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Please /start first.');

    const stats = await getReferralStats(ctx.from.id);
    const link = `https://t.me/${ctx.botInfo.username}?start=${user.referral_code}`;

    const text =
      `👥 *Referral Program*\n\n` +
      `Your code: \`${user.referral_code}\`\n` +
      `Your link:\n\`${link}\`\n\n` +
      `Invited: *${stats.count}* users\n` +
      `Bonus earned: *${formatUsd(stats.totalBonus)}*\n\n` +
      `You earn *${config.referralBonusPercent}%* of every ad reward your referrals receive.`;

    await ctx.replyWithMarkdown(text, mainMenu());
  });
};
