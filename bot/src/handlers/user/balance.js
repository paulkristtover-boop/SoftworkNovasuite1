const { getUser } = require('../../services/userService');
const { formatUsd } = require('../../utils/helpers');
const { mainMenu } = require('../../keyboards/user');

module.exports = function balanceHandler(bot) {
  bot.hears('💰 Balance', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Please /start first.');

    const text =
      `💰 *Your Balance*\n\n` +
      `Available: *${formatUsd(user.balance)}*\n` +
      `Total Earned: ${formatUsd(user.total_earned)}\n` +
      `Total Withdrawn: ${formatUsd(user.total_withdrawn)}\n\n` +
      `ID: \`${user.telegram_id}\``;

    await ctx.replyWithMarkdown(text, mainMenu());
  });
};
