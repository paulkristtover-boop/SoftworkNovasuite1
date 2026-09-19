const { getAvailableAdForUser, startAdView, completeAdView } = require('../../services/adService');
const { formatUsd } = require('../../utils/helpers');
const { mainMenu } = require('../../keyboards/user');
const { Markup } = require('telegraf');

module.exports = function earnHandler(bot) {
  bot.hears('👀 Earn (View Ads)', async (ctx) => showAd(ctx));

  bot.action('ad_skip', async (ctx) => {
    await ctx.answerCbQuery();
    await showAd(ctx);
  });

  bot.action(/^ad_start:(\d+)$/, async (ctx) => {
    const adId = parseInt(ctx.match[1], 10);
    try {
      const { token, durationSec, ad } = await startAdView(adId, ctx.from.id);
      ctx.session = ctx.session || {};
      ctx.session.viewToken = token;
      ctx.session.viewAdId = adId;
      ctx.session.viewStarted = Date.now();
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `👀 *Viewing Ad #${ad.id}*\n\n*${ad.title}*\nOpen the link, wait *${durationSec}s*, then confirm.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.url('🔗 Open Link', ad.url)],
            [Markup.button.callback('✅ I Completed the View', `ad_done:${adId}`)],
            [Markup.button.callback('⏭ Skip', 'ad_skip')],
          ]),
        }
      );
    } catch (e) {
      await ctx.answerCbQuery(e.message, { show_alert: true });
    }
  });

  bot.action(/^ad_done:(\d+)$/, async (ctx) => {
    const adId = parseInt(ctx.match[1], 10);
    const token = ctx.session?.viewToken;
    if (!token || ctx.session?.viewAdId !== adId) {
      return ctx.answerCbQuery('Start the ad first (Open Link flow).', { show_alert: true });
    }
    try {
      const result = await completeAdView(adId, ctx.from.id, token);
      ctx.session.viewToken = null;
      await ctx.answerCbQuery(`+${formatUsd(result.reward)}`);
      await ctx.editMessageText(
        `✅ Credited *${formatUsd(result.reward)}*`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('👀 Next Ad', 'ad_next')]]),
        }
      );
    } catch (e) {
      await ctx.answerCbQuery(e.message, { show_alert: true });
    }
  });

  bot.action('ad_next', async (ctx) => {
    await ctx.answerCbQuery();
    await showAd(ctx, true);
  });
};

async function showAd(ctx, edit = false) {
  const result = await getAvailableAdForUser(ctx.from.id);
  if (result.error) {
    const msg = `📭 ${result.error}`;
    if (edit) await ctx.editMessageText(msg).catch(() => ctx.reply(msg, mainMenu()));
    else await ctx.reply(msg, mainMenu());
    return;
  }
  if (!result.ad) {
    const msg = '📭 No ads available right now. Check back later.';
    if (edit) await ctx.editMessageText(msg).catch(() => {});
    else await ctx.reply(msg, mainMenu());
    return;
  }
  const ad = result.ad;
  const text = `👀 *Ad #${ad.id}*\n\n*${ad.title}*\n${ad.description || ''}\n\nType: ${ad.type}\nReward: *${formatUsd(ad.reward)}*\n⏱ Required view: ~${ad.duration_sec || 15}s`;
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('▶️ Start Verified View', `ad_start:${ad.id}`)],
    [Markup.button.callback('⏭ Skip', 'ad_skip')],
  ]);
  if (edit) {
    try {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb });
    } catch {
      await ctx.replyWithMarkdown(text, kb);
    }
  } else {
    await ctx.replyWithMarkdown(text, kb);
  }
}
