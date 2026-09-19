const { getUser } = require('../../services/userService');
const { formatUsd } = require('../../utils/helpers');
const { mainMenu } = require('../../keyboards/user');
const { card, tip, errorMsg } = require('../../utils/ui');

module.exports = function balanceHandler(bot) {
  bot.hears('💼 Wallet', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply(errorMsg('Please tap /start first.'), mainMenu());

    const text = card('💼 Your Wallet', [
      ['Available', `*${formatUsd(user.balance)}*`],
      ['Total earned', formatUsd(user.total_earned)],
      ['Total withdrawn', formatUsd(user.total_withdrawn)],
      ['Account ID', `\`${user.telegram_id}\``],
    ]);

    await ctx.replyWithMarkdown(
      `${text}\n\n${tip('Use Deposit to top up · Withdraw to cash out USDT')}`,
      mainMenu()
    );
  });
};
