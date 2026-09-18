const { getPaymentAddresses } = require('../../services/settingsService');
const { createDeposit } = require('../../services/financeService');
const { depositNetworks, mainMenu, cancelInline } = require('../../keyboards/user');
const { formatUsd } = require('../../utils/helpers');
const config = require('../../config');

module.exports = function depositHandler(bot) {
  bot.hears('📥 Deposit', async (ctx) => {
    const addresses = await getPaymentAddresses(true);
    if (!addresses.length) {
      return ctx.reply('⚠️ No payment addresses configured yet. Please contact support.', mainMenu());
    }
    ctx.session = { step: 'dep_select' };
    await ctx.reply('📥 *Deposit USDT*\n\nSelect network:', {
      parse_mode: 'Markdown',
      ...depositNetworks(addresses),
    });
  });

  bot.action(/^dep_net:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    const addresses = await getPaymentAddresses(true);
    const addr = addresses.find((a) => a.id === id);
    if (!addr) return ctx.reply('Address not found.');

    ctx.session = {
      step: 'dep_amount',
      deposit: { network: addr.network, address: addr.address, currency: addr.currency },
    };

    await ctx.editMessageText(
      `Network: *${addr.network}*\nCurrency: ${addr.currency}\n\nAddress:\n\`${addr.address}\`\n\nSend the *amount* you will deposit (USDT):`,
      { parse_mode: 'Markdown', ...cancelInline() }
    );
  });

  bot.on('text', async (ctx, next) => {
    if (!ctx.session?.step?.startsWith('dep_')) return next();
    const text = ctx.message.text.trim();

    if (ctx.session.step === 'dep_amount') {
      const amount = parseFloat(text);
      const minDep = require('../../config').minDeposit || 1;
      if (isNaN(amount) || amount < minDep) return ctx.reply(`Minimum deposit is ${minDep} USDT.`);
      ctx.session.deposit.amount = amount;
      ctx.session.step = 'dep_tx';
      await ctx.reply(
        `Amount: *${formatUsd(amount)}*\n\nAfter sending, reply with the *transaction hash (TxID)* or type "skip" if you will provide proof later:`,
        { parse_mode: 'Markdown', ...cancelInline() }
      );
      return;
    }

    if (ctx.session.step === 'dep_tx') {
      const txHash = text.toLowerCase() === 'skip' ? null : text;
      try {
        const dep = await createDeposit({
          userId: ctx.from.id,
          amount: ctx.session.deposit.amount,
          network: ctx.session.deposit.network,
          txHash,
        });
        ctx.session = {};
        await ctx.replyWithMarkdown(
          `✅ *Deposit request submitted*\n\nID: #${dep.id}\nAmount: ${formatUsd(dep.amount)}\nNetwork: ${dep.network}\nStatus: Pending admin approval\n\nYou will be notified once processed.`,
          mainMenu()
        );

        // Notify admins
        for (const aid of config.adminIds) {
          try {
            await ctx.telegram.sendMessage(
              aid,
              `📥 New Deposit #${dep.id}\nUser: ${ctx.from.id} (@${ctx.from.username || 'n/a'})\nAmount: ${dep.amount} USDT\nNetwork: ${dep.network}\nTx: ${txHash || 'n/a'}`,
              require('../../keyboards/admin').depositActions(dep.id)
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
