const { getAvailableAdForUser, startAdView, completeAdView } = require('../../services/adService');
const { formatUsd } = require('../../utils/helpers');
const {
  mainMenu,
  earnAdKeyboard,
  earnViewingKeyboard,
  earnNextKeyboard,
} = require('../../keyboards/user');
const { block, SEP, tip } = require('../../utils/ui');

module.exports = function earnHandler(bot) {
  bot.hears('⚡ Earn', async (ctx) => showAd(ctx));

  bot.action('ad_skip', async (ctx) => {
    await ctx.answerCbQuery('Skipped');
    ctx.session = ctx.session || {};
    ctx.session.viewToken = null;
    await showAd(ctx, true);
  });

  bot.action('ad_next', async (ctx) => {
    await ctx.answerCbQuery();
    await showAd(ctx, true);
  });

  bot.action(/^ad_start:(\d+)$/, async (ctx) => {
    const adId = parseInt(ctx.match[1], 10);
    try {
      const { token, durationSec, ad } = await startAdView(adId, ctx.from.id);
      ctx.session = ctx.session || {};
      ctx.session.viewToken = token;
      ctx.session.viewAdId = adId;
      ctx.session.viewNeedSec = durationSec;
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        block([
          '▶ *Verified view in progress*',
          SEP,
          `*${ad.title}*`,
          ad.type ? `_Type: ${ad.type}_` : null,
          '',
          '1. Tap *Open ad link* (Spotify, web, etc. all OK)',
          `2. Stay on it at least *${durationSec} seconds*`,
          '3. Come back here and tap *I completed the view*',
          '',
          tip('Leaving early will not credit a reward — timer starts when you tap Start'),
        ]),
        { parse_mode: 'Markdown', ...earnViewingKeyboard(adId, ad.url) }
      );
    } catch (e) {
      await ctx.answerCbQuery(e.message, { show_alert: true });
    }
  });

  bot.action(/^ad_done:(\d+)$/, async (ctx) => {
    const adId = parseInt(ctx.match[1], 10);
    const token = ctx.session?.viewToken;
    if (!token || ctx.session?.viewAdId !== adId) {
      return ctx.answerCbQuery('Tap “Start verified view” first.', { show_alert: true });
    }
    try {
      const result = await completeAdView(adId, ctx.from.id, token);
      ctx.session.viewToken = null;
      await ctx.answerCbQuery(`+${formatUsd(result.reward)}`);
      await ctx.editMessageText(
        block([
          '✅ *Reward credited*',
          SEP,
          `You earned *${formatUsd(result.reward)}*`,
          '',
          tip('Open Wallet → Recent activity to confirm'),
        ]),
        { parse_mode: 'Markdown', ...earnNextKeyboard() }
      );
    } catch (e) {
      await ctx.answerCbQuery(e.message, { show_alert: true });
    }
  });
};

async function showAd(ctx, edit = false) {
  const result = await getAvailableAdForUser(ctx.from.id);
  if (result.error) {
    const msg = block([
      '📭 *No ads right now*',
      SEP,
      result.error,
      '',
      tip('Try again later — new campaigns are announced when activated'),
    ]);
    if (edit) {
      try {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...earnNextKeyboard() });
      } catch {
        await ctx.replyWithMarkdown(msg, mainMenu());
      }
    } else {
      await ctx.replyWithMarkdown(msg, mainMenu());
    }
    return;
  }
  if (!result.ad) {
    const msg = block(['📭 *No ads available*', SEP, 'Check back soon for new campaigns.']);
    if (edit) {
      try {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...earnNextKeyboard() });
      } catch {
        await ctx.replyWithMarkdown(msg, mainMenu());
      }
    } else {
      await ctx.replyWithMarkdown(msg, mainMenu());
    }
    return;
  }

  const ad = result.ad;
  const dur = ad.duration_sec || 15;
  const text = block([
    '⚡ *Earn USDT*',
    SEP,
    `*${ad.title}*`,
    ad.description ? `_${String(ad.description).slice(0, 120)}_` : null,
    '',
    `• Type: ${ad.type || 'campaign'}`,
    `• Reward: *${formatUsd(ad.reward)}*`,
    `• Required time: *${dur}s*`,
    '',
    tip('Start → open link → wait full time → confirm'),
  ]);

  const kb = earnAdKeyboard(ad.id);
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
