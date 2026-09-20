const { getUser } = require('../../services/userService');
const { listMyAds } = require('../../services/adService');
const { formatUsd } = require('../../utils/helpers');
const { cancelInline, adTypeKeyboard, promoteMenu, mainMenu, backHome } = require('../../keyboards/user');
const { block, SEP, stepProgress, tip, errorMsg } = require('../../utils/ui');

module.exports = function advertiseHandler(bot) {
  bot.hears('📣 Promote', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply(errorMsg('Please tap /start first.'), mainMenu());

    await ctx.replyWithMarkdown(
      block([
        '📣 *Promote*',
        SEP,
        `Wallet: *${formatUsd(user.balance)}*`,
        '',
        'Create a campaign or manage the ones you already run.',
        '',
        tip('Budget is reserved from your balance on submit'),
      ]),
      promoteMenu()
    );
  });

  bot.action('promote_new', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply(errorMsg('Please /start first.'), mainMenu());
    ctx.session = { step: 'ad_title' };
    await ctx.replyWithMarkdown(
      block([
        '📣 *New campaign*',
        SEP,
        stepProgress(1, 4, 'Send a *title* (3–100 characters)'),
        '',
        tip('Spotify, YouTube, websites, bots, channels are all supported'),
      ]),
      cancelInline()
    );
  });

  bot.action('my_campaigns', async (ctx) => {
    await ctx.answerCbQuery();
    const ads = await listMyAds(ctx.from.id);
    if (!ads.length) {
      return ctx.replyWithMarkdown(
        block(['📋 *My campaigns*', SEP, '_No campaigns yet._', '', tip('Tap New campaign to create one')]),
        promoteMenu()
      );
    }

    await ctx.replyWithMarkdown(block(['📋 *My campaigns*', SEP, `_Showing ${ads.length}_`]));

    for (const a of ads) {
      const left = Math.max(0, parseFloat(a.budget) - parseFloat(a.spent));
      await ctx.replyWithMarkdown(
        block([
          `*#${a.id}* · ${a.title}`,
          `Status: *${a.status}* · Type: ${a.type || '—'}`,
          `Reward: ${formatUsd(a.reward)} · Views: ${a.views_done}`,
          `Budget: ${formatUsd(a.budget)} · Spent: ${formatUsd(a.spent)} · Left: ${formatUsd(left)}`,
          `Link: ${a.url}`,
          a.status === 'pending' ? '_Awaiting admin approval_' : null,
        ])
      );
    }
    await ctx.reply('Options:', promoteMenu());
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
