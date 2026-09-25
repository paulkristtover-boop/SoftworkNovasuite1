const { getPaymentAddresses } = require('../../services/settingsService');
const { depositNetworks, mainMenu, cancelInline } = require('../../keyboards/user');
const { quoteDeposit, fetchLiveUsdPrices } = require('../../services/ratesService');
const { block, SEP, stepProgress, tip, errorMsg } = require('../../utils/ui');
const { formatUsd } = require('../../utils/helpers');
const { Markup } = require('telegraf');
const config = require('../../config');

module.exports = function depositHandler(bot) {
  bot.hears('➕ Deposit', async (ctx) => {
    const addresses = await getPaymentAddresses(true);
    if (!addresses.length) {
      return ctx.replyWithMarkdown(
        block(['➕ *Deposit*', SEP, errorMsg('No deposit methods configured.'), tip('Contact support')]),
        mainMenu()
      );
    }

    // Live prices for display
    const symbols = [...new Set(addresses.map((a) => (a.currency || 'USDT').toUpperCase()))];
    let prices = {};
    try {
      prices = await fetchLiveUsdPrices(symbols);
    } catch (_) {}

    const rows = addresses.map((a) => {
      const cur = (a.currency || 'USDT').toUpperCase();
      const px = a.rate_usd ? parseFloat(a.rate_usd) : prices[cur];
      const min = a.min_amount != null ? parseFloat(a.min_amount) : config.minDeposit;
      const fee = a.fee_percent != null ? parseFloat(a.fee_percent) : 0;
      const pxLabel = px ? `~$${Number(px).toLocaleString()}` : '';
      const label = `${cur} · ${a.network}${pxLabel ? ' · ' + pxLabel : ''}`;
      return [Markup.button.callback(label, `dep_net:${a.id}`)];
    });
    rows.push([Markup.button.callback('« Cancel', 'cancel')]);

    ctx.session = { step: 'dep_select' };
    await ctx.replyWithMarkdown(
      block([
        '➕ *Deposit (credit USDT balance)*',
        SEP,
        '1. Choose coin / network',
        '2. Enter how much *USDT credit* you want',
        '3. Send the exact crypto amount shown',
        '4. Submit TxID → admin reviews',
        '',
        tip('Prices are live market rates · min & fees shown per method'),
      ]),
      Markup.inlineKeyboard(rows)
    );
  });

  bot.action(/^dep_net:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    const addresses = await getPaymentAddresses(true);
    const addr = addresses.find((a) => a.id === id);
    if (!addr) return ctx.reply(errorMsg('Method not found.'), mainMenu());

    const cur = (addr.currency || 'USDT').toUpperCase();
    let quoteHint = '';
    try {
      const sample = await quoteDeposit({
        currency: cur,
        network: addr.network,
        usdAmount: Math.max(parseFloat(addr.min_amount) || config.minDeposit, 10),
        addressRow: addr,
      });
      quoteHint = [
        `Example for *$${sample.desiredCreditUsd}* credit:`,
        `Send ≈ *${sample.cryptoAmount} ${cur}* (incl. fee)`,
        `Rate: $${sample.priceUsd} · Fee: ${sample.feePercent}% · Min: $${sample.minUsd}`,
      ].join('\n');
    } catch (_) {
      quoteHint = `Min ≈ $${addr.min_amount || config.minDeposit}`;
    }

    ctx.session = {
      step: 'dep_amount',
      deposit: {
        addressId: addr.id,
        network: addr.network,
        address: addr.address,
        currency: cur,
        min_amount: addr.min_amount,
        fee_percent: addr.fee_percent,
        rate_usd: addr.rate_usd,
      },
    };

    await ctx.editMessageText(
      block([
        '➕ *Deposit*',
        SEP,
        stepProgress(1, 3, `*${cur}* on *${addr.network}*`),
        '',
        quoteHint,
        '',
        'Enter the *USDT credit* you want on your balance (e.g. `10`):',
      ]),
      { parse_mode: 'Markdown', ...cancelInline() }
    );
  });
};
