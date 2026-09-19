const { getPaymentAddresses } = require('../../services/settingsService');
const { depositNetworks, mainMenu, cancelInline } = require('../../keyboards/user');
const { block, SEP, stepProgress, tip, errorMsg } = require('../../utils/ui');

module.exports = function depositHandler(bot) {
  bot.hears('➕ Deposit', async (ctx) => {
    const addresses = await getPaymentAddresses(true);
    if (!addresses.length) {
      return ctx.replyWithMarkdown(
        block(['➕ *Deposit*', SEP, errorMsg('No deposit addresses configured yet.'), tip('Contact support')]),
        mainMenu()
      );
    }
    ctx.session = { step: 'dep_select' };
    await ctx.replyWithMarkdown(
      block([
        '➕ *Deposit USDT*',
        SEP,
        '1. Choose network',
        '2. Send USDT to the address shown',
        '3. Submit amount + TxID',
        '4. Wait for admin review',
        '',
        tip('Only send the matching network · wrong network = lost funds'),
      ]),
      depositNetworks(addresses)
    );
  });

  bot.action(/^dep_net:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    const addresses = await getPaymentAddresses(true);
    const addr = addresses.find((a) => a.id === id);
    if (!addr) return ctx.reply(errorMsg('Address not found.'), mainMenu());

    ctx.session = {
      step: 'dep_amount',
      deposit: { network: addr.network, address: addr.address, currency: addr.currency },
    };

    await ctx.editMessageText(
      block([
        '➕ *Deposit USDT*',
        SEP,
        stepProgress(2, 3, `Network: *${addr.network}* · ${addr.currency || 'USDT'}`),
        '',
        '*Send only USDT to:*',
        `\`${addr.address}\``,
        '',
        'Then enter the *amount* you sent:',
      ]),
      { parse_mode: 'Markdown', ...cancelInline() }
    );
  });
};
