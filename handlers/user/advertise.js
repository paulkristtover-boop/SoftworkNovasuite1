const { getUser } = require('../../services/userService');
const { formatUsd } = require('../../utils/helpers');
const { cancelInline, adTypeKeyboard } = require('../../keyboards/user');
const { block, SEP, stepProgress, tip, errorMsg } = require('../../utils/ui');
const { mainMenu } = require('../../keyboards/user');

module.exports = function advertiseHandler(bot) {
  bot.hears('📣 Promote', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply(errorMsg('Please tap /start first.'), mainMenu());

    ctx.session = { step: 'ad_title' };
    await ctx.replyWithMarkdown(
      block([
        '📣 *Create a campaign*',
        SEP,
        `Wallet balance: *${formatUsd(user.balance)}*`,
        '',
        stepProgress(1, 4, 'Send a *title* (3–100 characters)'),
        '',
        tip('Budget is reserved from your balance when submitted'),
      ]),
      cancelInline()
    );
  });

  bot.action(/^adtype:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.session?.ad) return;
    ctx.session.ad.type = ctx.match[1];
    ctx.session.step = 'ad_reward';
    await ctx.replyWithMarkdown(
      block([
        stepProgress(3, 4, `Type: *${ctx.match[1]}*`),
        '',
        'Enter *reward per view* in USDT (e.g. `0.01`)',
      ]),
      cancelInline()
    );
  });
};
