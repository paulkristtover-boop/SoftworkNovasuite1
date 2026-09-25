const { getUser } = require('../../services/userService');
const { getSetting, getPaymentAddresses } = require('../../services/settingsService');
const { quoteWithdraw, formatQuoteLines } = require('../../services/ratesService');
const { mainMenu, cancelInline } = require('../../keyboards/user');
const { formatUsd } = require('../../utils/helpers');
const { block, SEP, stepProgress, tip, errorMsg } = require('../../utils/ui');
const { Markup } = require('telegraf');
const config = require('../../config');

module.exports = function withdrawHandler(bot) {
  bot.hears('➖ Withdraw', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply(errorMsg('Please tap /start first.'), mainMenu());

    const min = parseFloat(await getSetting('min_withdraw', String(config.minWithdraw)));
    if (parseFloat(user.balance) < min) {
      return ctx.replyWithMarkdown(
        block([
          '➖ *Withdraw*',
          SEP,
          `Minimum: *${formatUsd(min)}*`,
          `Your balance: *${formatUsd(user.balance)}*`,
          tip('Earn or deposit to reach the minimum'),
        ]),
        mainMenu()
      );
    }

    ctx.session = { step: 'wd_amount' };
    await ctx.replyWithMarkdown(
      block([
        '➖ *Withdraw*',
        SEP,
        `Available: *${formatUsd(user.balance)}*`,
        `Platform minimum: *${formatUsd(min)}*`,
        '',
        stepProgress(1, 3, 'Enter amount in *USDT* to withdraw from balance'),
        '',
        tip('Admin pays manually from Trust wallet after approval'),
      ]),
      cancelInline()
    );
  });
};
