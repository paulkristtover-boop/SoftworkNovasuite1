/**
 * Inline query handlers (optional search / deep links).
 * Keeps UI lightweight — users primarily use reply keyboards.
 */
const { money } = require('../utils/format');
const users = require('../services/users');

function registerInline(bot) {
  bot.on('inline_query', async (ctx) => {
    const q = (ctx.inlineQuery.query || '').trim().toLowerCase();
    const results = [];

    if (!q || q === 'help' || q === 'menu') {
      results.push({
        type: 'article',
        id: 'help',
        title: 'Open wallet bot',
        description: 'Deposit · Withdraw · Support (USDT)',
        input_message_content: {
          message_text: 'Open @' + (ctx.botInfo?.username || 'this bot') + ' and tap /start',
        },
      });
    }

    if (q === 'balance' && ctx.from) {
      try {
        const user = await users.getByTelegramId(ctx.from.id);
        if (user) {
          results.push({
            type: 'article',
            id: 'bal',
            title: 'Your balance',
            description: money(user.balance),
            input_message_content: {
              message_text: `💰 Balance: ${money(user.balance)}`,
            },
          });
        }
      } catch (_) {}
    }

    await ctx.answerInlineQuery(results, { cache_time: 10, is_personal: true });
  });
}

module.exports = { registerInline };
