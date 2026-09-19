const { getUser } = require('../../services/userService');
const { formatUsd } = require('../../utils/helpers');
const { mainMenu } = require('../../keyboards/user');

module.exports = function balanceHandler(bot) {
  bot.hears('💰 Balance', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Please /start first.');
    await ctx.replyWithMarkdown(
      `💰 *Balance*\n\nAvailable: *${formatUsd(user.balance)}*\nEarned: ${formatUsd(user.total_earned)}\nWithdrawn: ${formatUsd(user.total_withdrawn)}\nID: \`${user.telegram_id}\``,
      mainMenu()
    );
  });
};
