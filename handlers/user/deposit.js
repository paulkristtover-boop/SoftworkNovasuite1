const { getPaymentAddresses } = require('../../services/settingsService');
const { depositNetworks, mainMenu, cancelInline } = require('../../keyboards/user');
module.exports = function depositHandler(bot) {
  bot.hears('📥 Deposit', async (ctx) => {
    const addresses = await getPaymentAddresses(true);
    if (!addresses.length) return ctx.reply('No deposit addresses yet. Contact support.', mainMenu());
    ctx.session = { step: 'dep_select' };
    await ctx.reply('📥 *Deposit USDT* — select network:', { parse_mode: 'Markdown', ...depositNetworks(addresses) });
  });
  bot.action(/^dep_net:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    const addresses = await getPaymentAddresses(true);
    const addr = addresses.find((a) => a.id === id);
    if (!addr) return ctx.reply('Not found');
    ctx.session = { step: 'dep_amount', deposit: { network: addr.network, address: addr.address, currency: addr.currency } };
    await ctx.editMessageText(`Network: *${addr.network}*\nSend USDT to:\n\`${addr.address}\`\n\nEnter amount:`, { parse_mode: 'Markdown', ...cancelInline() });
  });
};
