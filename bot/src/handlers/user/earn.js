const { getAvailableAdForUser, completeAdView } = require('../../services/adService');
const { formatUsd } = require('../../utils/helpers');
const { Markup } = require('telegraf');
const { mainMenu } = require('../../keyboards/user');

module.exports = function earnHandler(bot) {
  bot.hears('👀 Earn (View Ads)', async (ctx) => {
    await showAd(ctx);
  });

  bot.action('ad_skip', async (ctx) => {
    await ctx.answerCbQuery();
    await showAd(ctx);
  });

  bot.action(/^ad_done:(\d+)$/, async (ctx) => {
    const adId = parseInt(ctx.match[1], 10);
    try {
      const result = await completeAdView(adId, ctx.from.id);
      await ctx.answerCbQuery(`+${formatUsd(result.reward)}`);
      await ctx.editMessageText(
        `✅ *Reward credited!*\nYou earned *${formatUsd(result.reward)}*\n\nTap below for next ad.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('👀 Next Ad', 'ad_next')]]),
        }
      );
    } catch (e) {
      await ctx.answerCbQuery(e.message || 'Error', { show_alert: true });
    }
  });

  bot.action('ad_next', async (ctx) => {
    await ctx.answerCbQuery();
    await showAd(ctx, true);
  });
};

async function showAd(ctx, edit = false) {
  const ad = await getAvailableAdForUser(ctx.from.id);
  if (!ad) {
    const msg = '📭 No more ads available right now.\nCome back later or create your own!';
    if (edit) await ctx.editMessageText(msg);
    else await ctx.reply(msg, mainMenu());
    return;
  }

  const text =
    `👀 *Ad #${ad.id}*\n\n` +
    `*${ad.title}*\n` +
    `${ad.description || ''}\n\n` +
    `Type: ${ad.type}\n` +
    `Reward: *${formatUsd(ad.reward)}*\n` +
    `⏱ View for ~${ad.duration_sec}s then confirm.`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('🔗 Open Link', ad.url)],
    [Markup.button.callback('✅ I Viewed It', `ad_done:${ad.id}`)],
    [Markup.button.callback('⏭ Skip', 'ad_skip')],
  ]);

  if (edit) {
    try {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    } catch {
      await ctx.replyWithMarkdown(text, keyboard);
    }
  } else {
    await ctx.replyWithMarkdown(text, keyboard);
  }
}
