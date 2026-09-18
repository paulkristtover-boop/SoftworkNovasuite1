const { getUser } = require('../../services/userService');
const { createWithdrawal } = require('../../services/financeService');
const { getSetting } = require('../../services/settingsService');
const { mainMenu, cancelInline } = require('../../keyboards/user');
const { formatUsd } = require('../../utils/helpers');
const config = require('../../config');

module.exports = function withdrawHandler(bot) {
  bot.hears('📤 Withdraw', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Please /start first.');
    const min = parseFloat(await getSetting('min_withdraw', '5'));

    if (parseFloat(user.balance) < min) {
      return ctx.reply(`Minimum withdrawal is ${formatUsd(min)}. Your balance: ${formatUsd(user.balance)}`, mainMenu());
    }

    ctx.session = { step: 'wd_amount' };
    await ctx.reply(
      `📤 *Withdraw USDT*\n\nBalance: ${formatUsd(user.balance)}\nMin: ${formatUsd(min)}\n\nEnter amount to withdraw:`,
      { parse_mode: 'Markdown', ...cancelInline() }
    );
  });

  bot.on('text', async (ctx, next) => {
    if (!ctx.session?.step?.startsWith('wd_')) return next();
    const text = ctx.message.text.trim();

    if (ctx.session.step === 'wd_amount') {
      const amount = parseFloat(text);
      const min = parseFloat(await getSetting('min_withdraw', '5'));
      if (isNaN(amount) || amount < min) return ctx.reply(`Minimum is ${min} USDT`);
      const user = await getUser(ctx.from.id);
      if (amount > parseFloat(user.balance)) return ctx.reply('Insufficient balance.');

      ctx.session.wd = { amount };
      ctx.session.step = 'wd_network';
      await ctx.reply('Enter network (e.g. TRC20, ERC20, BEP20):', cancelInline());
      return;
    }

    if (ctx.session.step === 'wd_network') {
      ctx.session.wd.network = text.toUpperCase();
      ctx.session.step = 'wd_address';
      await ctx.reply('Enter your *USDT wallet address*:', { parse_mode: 'Markdown', ...cancelInline() });
      return;
    }

    if (ctx.session.step === 'wd_address') {
      if (text.length < 20) return ctx.reply('Invalid address.');
      try {
        const wd = await createWithdrawal({
          userId: ctx.from.id,
          amount: ctx.session.wd.amount,
          network: ctx.session.wd.network,
          address: text,
        });
        ctx.session = {};
        await ctx.replyWithMarkdown(
          `✅ *Withdrawal requested*\n\nID: #${wd.id}\nAmount: ${formatUsd(wd.amount)}\nNetwork: ${wd.network}\nAddress: \`${wd.address}\`\n\nStatus: Pending\nAdmin will pay manually and notify you.`,
          mainMenu()
        );

        for (const aid of config.adminIds) {
          try {
            await ctx.telegram.sendMessage(
              aid,
              `📤 New Withdrawal #${wd.id}\nUser: ${ctx.from.id}\nAmount: ${wd.amount} USDT\nNetwork: ${wd.network}\nAddress: ${wd.address}`,
              require('../../keyboards/admin').withdrawalActions(wd.id)
            );
          } catch (_) {}
        }
      } catch (e) {
        ctx.session = {};
        await ctx.reply(`❌ ${e.message}`, mainMenu());
      }
    }
  });
};
