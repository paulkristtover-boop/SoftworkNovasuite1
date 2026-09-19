const { getUser } = require('../../services/userService');
const { pool } = require('../../database');
const { formatUsd } = require('../../utils/helpers');
const { mainMenu } = require('../../keyboards/user');
const { Markup } = require('telegraf');
const { card, tip, errorMsg, block, SEP } = require('../../utils/ui');

module.exports = function balanceHandler(bot) {
  bot.hears('💼 Wallet', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply(errorMsg('Please tap /start first.'), mainMenu());

    const text = card('💼 Your Wallet', [
      ['Available', `*${formatUsd(user.balance)}*`],
      ['Total earned', formatUsd(user.total_earned)],
      ['Total withdrawn', formatUsd(user.total_withdrawn)],
      ['Account ID', `\`${user.telegram_id}\``],
    ]);

    await ctx.replyWithMarkdown(
      `${text}\n\n${tip('Deposit · Withdraw · or view recent activity')}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📜 Recent activity', 'wallet_history')],
        [
          Markup.button.callback('➕ Deposit', 'wallet_go_deposit'),
          Markup.button.callback('➖ Withdraw', 'wallet_go_withdraw'),
        ],
      ])
    );
  });

  bot.action('wallet_history', async (ctx) => {
    await ctx.answerCbQuery();
    const res = await pool.query(
      `SELECT type, amount, balance_after, note, created_at
       FROM transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 12`,
      [ctx.from.id]
    );

    if (!res.rows.length) {
      return ctx.replyWithMarkdown(
        block(['📜 *Activity*', SEP, '_No transactions yet._', '', tip('Earn from ads or deposit to get started')]),
        mainMenu()
      );
    }

    const lines = res.rows.map((t) => {
      const sign = parseFloat(t.amount) >= 0 ? '+' : '';
      const when = new Date(t.created_at).toLocaleString();
      return `• \`${sign}${formatUsd(t.amount)}\` · ${t.type}\n  _${when}_`;
    });

    await ctx.replyWithMarkdown(
      block(['📜 *Recent activity*', SEP, ...lines]),
      mainMenu()
    );
  });

  bot.action('wallet_go_deposit', async (ctx) => {
    await ctx.answerCbQuery();
    // trigger same flow as hears by simulating message path - reply prompt
    await ctx.reply('Open *➕ Deposit* from the menu to continue.', {
      parse_mode: 'Markdown',
      ...mainMenu(),
    });
  });

  bot.action('wallet_go_withdraw', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Open *➖ Withdraw* from the menu to continue.', {
      parse_mode: 'Markdown',
      ...mainMenu(),
    });
  });
};
