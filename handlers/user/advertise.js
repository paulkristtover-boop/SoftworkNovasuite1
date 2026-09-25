const { getUser } = require('../../services/userService');
const {
  listMyAds,
  topUpBudget,
  pauseAd,
  resumeAd,
  deleteAd,
  getAd,
} = require('../../services/adService');
const { formatUsd } = require('../../utils/helpers');
const {
  cancelInline,
  adTypeKeyboard,
  promoteMenu,
  mainMenu,
} = require('../../keyboards/user');
const { block, SEP, stepProgress, tip, errorMsg, success } = require('../../utils/ui');
const { Markup } = require('telegraf');
const config = require('../../config');

function campaignControls(a) {
  const rows = [];
  if (a.status === 'active') {
    rows.push([Markup.button.callback('⏸ Pause', `camp_pause:${a.id}`)]);
  }
  if (a.status === 'paused') {
    rows.push([Markup.button.callback('▶ Resume', `camp_resume:${a.id}`)]);
  }
  if (!['deleted', 'rejected'].includes(a.status)) {
    rows.push([
      Markup.button.callback('➕ Top up', `camp_topup:${a.id}`),
      Markup.button.callback('✏️ Edit link', `camp_edit:${a.id}`),
    ]);
    rows.push([Markup.button.callback('🗑 Delete / refund', `camp_del:${a.id}`)]);
  }
  rows.push([Markup.button.callback('« My campaigns', 'my_campaigns')]);
  return Markup.inlineKeyboard(rows);
}

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
        'Create campaigns or manage budget, pause, edit, delete.',
        '',
        tip(
          `Fee ${config.adPlatformFeePercent || 0}% · min reward ${config.minAdReward || 0.005} USDT`
        ),
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
        tip('Spotify, YouTube, websites, bots, channels supported'),
      ]),
      cancelInline()
    );
  });

  bot.action('my_campaigns', async (ctx) => {
    await ctx.answerCbQuery();
    const ads = await listMyAds(ctx.from.id);
    if (!ads.length) {
      return ctx.replyWithMarkdown(
        block(['📋 *My campaigns*', SEP, '_No campaigns yet._']),
        promoteMenu()
      );
    }

    await ctx.replyWithMarkdown(
      block(['📋 *My campaigns*', SEP, `_Showing ${ads.length} · tap controls under each_`])
    );

    for (const a of ads) {
      if (a.status === 'deleted') continue;
      const left = Math.max(0, parseFloat(a.budget) - parseFloat(a.spent));
      await ctx.replyWithMarkdown(
        block([
          `*#${a.id}* · ${a.title}`,
          `Status: *${a.status}* · ${a.type || '—'}`,
          `Reward: ${formatUsd(a.reward)} · Views: ${a.views_done}`,
          `Budget: ${formatUsd(a.budget)} · Spent: ${formatUsd(a.spent)} · Left: *${formatUsd(left)}*`,
          `Link: ${a.url}`,
          a.status === 'pending' ? '_Awaiting admin approval_' : null,
        ]),
        campaignControls(a)
      );
    }
    await ctx.reply('Options:', promoteMenu());
  });

  bot.action(/^camp_pause:(\d+)$/, async (ctx) => {
    try {
      const ad = await pauseAd(parseInt(ctx.match[1], 10), ctx.from.id);
      await ctx.answerCbQuery('Paused');
      await ctx.replyWithMarkdown(success('Campaign paused', `#${ad.id} · ${ad.title}`), promoteMenu());
    } catch (e) {
      await ctx.answerCbQuery(e.message, { show_alert: true });
    }
  });

  bot.action(/^camp_resume:(\d+)$/, async (ctx) => {
    try {
      const ad = await resumeAd(parseInt(ctx.match[1], 10), ctx.from.id);
      await ctx.answerCbQuery('Resumed');
      await ctx.replyWithMarkdown(success('Campaign live again', `#${ad.id} · ${ad.title}`), promoteMenu());
    } catch (e) {
      await ctx.answerCbQuery(e.message, { show_alert: true });
    }
  });

  bot.action(/^camp_topup:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    const ad = await getAd(id);
    if (!ad || String(ad.owner_id) !== String(ctx.from.id)) {
      return ctx.reply(errorMsg('Campaign not found.'), promoteMenu());
    }
    ctx.session = { step: 'camp_topup_amt', campId: id };
    await ctx.replyWithMarkdown(
      block([
        `➕ *Top up #${id}*`,
        SEP,
        `Current budget: ${formatUsd(ad.budget)} · Spent: ${formatUsd(ad.spent)}`,
        '',
        'Enter amount in *USDT* to add to budget:',
        tip(`Platform fee ${config.adPlatformFeePercent || 0}% applies`),
      ]),
      cancelInline()
    );
  });

  bot.action(/^camp_edit:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    const ad = await getAd(id);
    if (!ad || String(ad.owner_id) !== String(ctx.from.id)) {
      return ctx.reply(errorMsg('Campaign not found.'), promoteMenu());
    }
    ctx.session = { step: 'camp_edit_url', campId: id };
    await ctx.replyWithMarkdown(
      block([
        `✏️ *Edit #${id}*`,
        SEP,
        `Current: ${ad.url}`,
        '',
        'Send the *new URL*. Active campaigns go back to pending review.',
      ]),
      cancelInline()
    );
  });

  bot.action(/^camp_del:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    await ctx.replyWithMarkdown(
      block([`🗑 Delete campaign *#${id}*?`, 'Unused budget is refunded to your wallet.']),
      Markup.inlineKeyboard([
        [Markup.button.callback('Yes, delete & refund', `camp_del_ok:${id}`)],
        [Markup.button.callback('Cancel', 'my_campaigns')],
      ])
    );
  });

  bot.action(/^camp_del_ok:(\d+)$/, async (ctx) => {
    try {
      const r = await deleteAd(parseInt(ctx.match[1], 10), ctx.from.id);
      await ctx.answerCbQuery('Deleted');
      await ctx.replyWithMarkdown(
        success('Campaign deleted', `Refunded *${formatUsd(r.refunded)}* to wallet`),
        promoteMenu()
      );
    } catch (e) {
      await ctx.answerCbQuery(e.message, { show_alert: true });
    }
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
        `Enter *reward per view* in USDT (min ${config.minAdReward || 0.005})`,
      ]),
      cancelInline()
    );
  });
};
