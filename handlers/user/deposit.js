const { getPaymentAddresses } = require('../../services/settingsService');
const { mainMenu, cancelInline } = require('../../keyboards/user');
const { quoteDeposit, fetchLiveUsdPrices, formatQuoteLines } = require('../../services/ratesService');
const { block, SEP, stepProgress, tip, errorMsg } = require('../../utils/ui');
const { formatUsd } = require('../../utils/helpers');
const { Markup } = require('telegraf');
const config = require('../../config');

const PRESETS = [5, 10, 25, 50, 100];

function methodKeyboard(addresses, prices) {
  const rows = addresses.map((a) => {
    const cur = (a.currency || 'USDT').toUpperCase();
    const px = a.rate_usd ? parseFloat(a.rate_usd) : prices[cur];
    const min = a.min_amount != null ? parseFloat(a.min_amount) : config.minDeposit;
    const fee = a.fee_percent != null ? parseFloat(a.fee_percent) : 0;
    const bits = [`${cur}`, a.network];
    if (px) bits.push(`$${Number(px) >= 10 ? Number(px).toFixed(0) : Number(px).toPrecision(4)}`);
    if (fee) bits.push(`fee ${fee}%`);
    bits.push(`min $${min}`);
    return [Markup.button.callback(bits.join(' · '), `dep_net:${a.id}`)];
  });
  rows.push([Markup.button.callback('« Cancel', 'cancel')]);
  return Markup.inlineKeyboard(rows);
}

function amountKeyboard(minUsd) {
  const rows = [];
  const line = PRESETS.filter((p) => p >= minUsd).slice(0, 5);
  if (line.length) {
    rows.push(line.map((p) => Markup.button.callback(`$${p}`, `dep_amt:${p}`)));
  }
  rows.push([Markup.button.callback('✏️ Custom amount', 'dep_amt_custom')]);
  rows.push([Markup.button.callback('« Cancel', 'cancel')]);
  return Markup.inlineKeyboard(rows);
}

async function presentQuote(ctx, usd) {
  const d = ctx.session?.deposit;
  if (!d) {
    return ctx.reply(errorMsg('Session expired. Tap Deposit again.'), mainMenu());
  }
  try {
    const q = await quoteDeposit({
      currency: d.currency,
      network: d.network,
      usdAmount: usd,
      addressRow: d,
    });
    ctx.session.deposit = { ...d, ...q, amount: q.creditUsd };
    ctx.session.step = 'dep_confirm_wait';
    await ctx.replyWithMarkdown(
      block([
        '📋 *Payment summary*',
        SEP,
        ...formatQuoteLines(q, 'deposit'),
        '',
        tip('Confirm to reveal the deposit address'),
      ]),
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirm & show address', 'dep_confirm')],
        [Markup.button.callback('« Cancel', 'cancel')],
      ])
    );
  } catch (e) {
    await ctx.reply(errorMsg(e.message), cancelInline());
  }
}

module.exports = function depositHandler(bot) {
  bot.hears('➕ Deposit', async (ctx) => {
    const addresses = await getPaymentAddresses(true);
    if (!addresses.length) {
      return ctx.replyWithMarkdown(
        block(['➕ *Deposit*', SEP, errorMsg('No deposit methods yet.'), tip('Contact support')]),
        mainMenu()
      );
    }
    let prices = {};
    try {
      prices = await fetchLiveUsdPrices(addresses.map((a) => a.currency || 'USDT'));
    } catch (_) {}

    ctx.session = {};
    await ctx.replyWithMarkdown(
      block([
        '➕ *Deposit → USDT balance*',
        SEP,
        'Your balance is always in *USDT*.',
        'Pay with any configured coin at the rate shown.',
        '',
        '1. Choose method',
        '2. Choose credit amount',
        '3. Confirm → send exact crypto',
        '4. Submit TxID → admin approves',
        '',
        tip('On-chain network fees are separate from platform fee'),
      ]),
      methodKeyboard(addresses, prices)
    );
  });

  bot.action(/^dep_net:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    const addresses = await getPaymentAddresses(true);
    const addr = addresses.find((a) => a.id === id);
    if (!addr) return ctx.reply(errorMsg('Method not found.'), mainMenu());

    const cur = (addr.currency || 'USDT').toUpperCase();
    const min = parseFloat(addr.min_amount) || config.minDeposit;

    let sampleLines = [`Min credit: $${min}`];
    try {
      const sample = await quoteDeposit({
        currency: cur,
        network: addr.network,
        usdAmount: Math.max(min, 10),
        addressRow: addr,
      });
      sampleLines = formatQuoteLines(sample, 'deposit');
    } catch (_) {}

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
        label: addr.label,
      },
    };

    const text = block([
      '➕ *Deposit*',
      SEP,
      stepProgress(1, 3, `*${cur}* · *${addr.network}*`),
      addr.label ? `_${addr.label}_` : null,
      '',
      ...sampleLines,
      '',
      'Pick a credit amount or enter a custom value:',
    ]);

    try {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...amountKeyboard(min) });
    } catch (_) {
      await ctx.replyWithMarkdown(text, amountKeyboard(min));
    }
  });

  bot.action(/^dep_amt:(\d+(?:\.\d+)?)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await presentQuote(ctx, parseFloat(ctx.match[1]));
  });

  bot.action('dep_amt_custom', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = ctx.session || {};
    ctx.session.step = 'dep_amount';
    await ctx.replyWithMarkdown(
      block([stepProgress(2, 3, 'Type the *USDT credit* amount (e.g. `15`)')]),
      cancelInline()
    );
  });

  bot.action('dep_confirm', async (ctx) => {
    await ctx.answerCbQuery();
    const d = ctx.session?.deposit;
    if (!d || !(d.cryptoAmount || d.cryptoToSend)) {
      return ctx.reply(errorMsg('Session expired. Start Deposit again.'), mainMenu());
    }
    ctx.session.step = 'dep_tx';
    const crypto = d.cryptoToSend || d.cryptoAmount;
    await ctx.replyWithMarkdown(
      block([
        stepProgress(3, 3, '*Send payment now*'),
        SEP,
        `Send exactly: *${crypto} ${d.currency}*`,
        `Network: *${d.network}*`,
        '',
        '*Address:*',
        '`' + d.address + '`',
        '',
        `After approval you get: *${formatUsd(d.creditUsd || d.desiredCreditUsd || d.amount)}*`,
        '',
        'Reply with your *TxID* (or `skip`):',
        tip('Wrong network can mean permanent loss — verify carefully'),
      ]),
      cancelInline()
    );
  });
};
