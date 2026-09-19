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
    await ctx.replyWithMarkdown(`👥 *Referrals*\n\nCode: \`${user.referral_code}\`\nLink:\n\`${link}\`\n\nInvited: *${stats.count}*\nBonus: *${formatUsd(stats.totalBonus)}*\n\nYou earn *${config.referralBonusPercent}%* of referral ad rewards.`, mainMenu());
  });
};
