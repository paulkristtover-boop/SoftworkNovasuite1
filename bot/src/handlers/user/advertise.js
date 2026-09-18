const { createAd } = require('../../services/adService');
const { getUser } = require('../../services/userService');
const { formatUsd } = require('../../utils/helpers');
const { mainMenu, cancelInline } = require('../../keyboards/user');
const { Markup } = require('telegraf');
const config = require('../../config');

module.exports = function advertiseHandler(bot) {
  bot.hears('📢 Advertise', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Please /start first.');

    ctx.session = { step: 'ad_title' };
    await ctx.reply(
      `📢 *Create an Ad*\n\nYour balance: ${formatUsd(user.balance)}\n\nSend the *title* of your ad (max 100 chars):`,
      { parse_mode: 'Markdown', ...cancelInline() }
    );
  });

  bot.on('text', async (ctx, next) => {
    if (!ctx.session?.step?.startsWith('ad_')) return next();

    const text = ctx.message.text.trim();
    if (text === '❌ Cancel' || text === 'cancel') {
      ctx.session = {};
      return ctx.reply('Cancelled.', mainMenu());
    }

    try {
      switch (ctx.session.step) {
        case 'ad_title':
          if (text.length < 3 || text.length > 100) return ctx.reply('Title must be 3–100 characters.');
          ctx.session.ad = { title: text };
          ctx.session.step = 'ad_url';
          await ctx.reply('Send the *URL* (bot link, website, or channel):', { parse_mode: 'Markdown', ...cancelInline() });
          break;

        case 'ad_url':
          if (!text.startsWith('http') && !text.startsWith('t.me') && !text.startsWith('https://t.me')) {
            return ctx.reply('Please send a valid URL (https:// or t.me/...)');
          }
          let url = text;
          if (url.startsWith('t.me')) url = 'https://' + url;
          ctx.session.ad.url = url;
          ctx.session.step = 'ad_type';
          await ctx.reply('Select type:', Markup.inlineKeyboard([
            [Markup.button.callback('🌐 Website', 'adtype:website'), Markup.button.callback('🤖 Bot', 'adtype:bot')],
            [Markup.button.callback('📢 Channel', 'adtype:channel'), Markup.button.callback('📦 Other', 'adtype:other')],
          ]));
          break;

        case 'ad_reward':
          const reward = parseFloat(text);
          if (isNaN(reward) || reward < 0.001) return ctx.reply('Enter a valid reward (min 0.001 USDT)');
          ctx.session.ad.reward = reward;
          ctx.session.step = 'ad_budget';
          await ctx.reply(`Enter total *budget* in USDT (will be deducted from your balance):`, { parse_mode: 'Markdown', ...cancelInline() });
          break;

        case 'ad_budget':
          const budget = parseFloat(text);
          if (isNaN(budget) || budget < ctx.session.ad.reward) {
            return ctx.reply(`Budget must be ≥ reward (${ctx.session.ad.reward} USDT)`);
          }
          ctx.session.ad.budget = budget;
          ctx.session.step = null;

          const ad = await createAd({
            ownerId: ctx.from.id,
            title: ctx.session.ad.title,
            url: ctx.session.ad.url,
            type: ctx.session.ad.type || 'website',
            reward: ctx.session.ad.reward,
            budget: ctx.session.ad.budget,
            durationSec: 15,
          });

          ctx.session = {};
          await ctx.replyWithMarkdown(
            `✅ *Ad submitted!*\n\nID: #${ad.id}\nTitle: ${ad.title}\nReward: ${formatUsd(ad.reward)}\nBudget: ${formatUsd(ad.budget)}\n\nStatus: *Pending admin approval*\nYou will be notified when it goes live.`,
            mainMenu()
          );
          // Notify admins
          for (const aid of config.adminIds) {
            try {
              await ctx.telegram.sendMessage(
                aid,
                `🆕 New Ad #${ad.id} pending approval\nFrom: ${ctx.from.id}\nTitle: ${ad.title}\nBudget: ${ad.budget} USDT`,
                require('../../keyboards/admin').adModeration(ad.id)
              );
            } catch (_) {}
          }
          break;

        default:
          return next();
      }
    } catch (e) {
      ctx.session = {};
      await ctx.reply(`❌ ${e.message}`, mainMenu());
    }
  });

  bot.action(/^adtype:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.session?.ad) return;
    ctx.session.ad.type = ctx.match[1];
    ctx.session.step = 'ad_reward';
    await ctx.reply(`Type set to *${ctx.match[1]}*.\nNow enter reward per view in USDT (e.g. 0.01):`, {
      parse_mode: 'Markdown',
      ...cancelInline(),
    });
  });
};
