const { getUser } = require('../../services/userService');
const { getSetting } = require('../../services/settingsService');
const { mainMenu, cancelInline } = require('../../keyboards/user');
const { formatUsd } = require('../../utils/helpers');
const { block, SEP, stepProgress, tip, errorMsg } = require('../../utils/ui');
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
          '',
          tip('Earn more from ads or deposit to reach the minimum'),
        ]),
        mainMenu()
      );
    }

    ctx.session = { step: 'wd_amount' };
    await ctx.replyWithMarkdown(
      block([
        '➖ *Withdraw USDT*',
        SEP,
        `Available: *${formatUsd(user.balance)}*`,
        `Minimum: *${formatUsd(min)}*`,
        '',
        stepProgress(1, 3, 'Enter the *amount* to withdraw'),
        '',
        tip('Paid manually by admin from Trust wallet after review'),
      ]),
      cancelInline()
    );
  });
};
