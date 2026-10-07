const { getUser } = require('../../services/userService');
const { getSetting } = require('../../services/settingsService');
const { quoteWithdraw, formatQuoteLines, NETWORK_PRESETS } = require('../../services/ratesService');
const { createWithdrawal } = require('../../services/financeService');
const { mainMenu, cancelInline } = require('../../keyboards/user');
const { formatUsd } = require('../../utils/helpers');
const { block, SEP, stepProgress, tip, success, errorMsg } = require('../../utils/ui');
const { Markup } = require('telegraf');
const config = require('../../config');

const PRESETS = [5, 10, 25, 50, 100, 250];
const NETWORKS = NETWORK_PRESETS.USDT || ['TRC20', 'BEP20', 'ERC20', 'SOL', 'TON'];

function amountKeyboard(minUsd, balance) {
  const rows = [];
  const line = PRESETS.filter((p) => p >= minUsd && p <= balance).slice(0, 6);
  if (line.length) {
    const mid = Math.ceil(line.length / 2);
    rows.push(line.slice(0, mid).map((p) => Markup.button.callback(`$${p}`, `wd_amt:${p}`)));
    if (line.length > mid) {
      rows.push(line.slice(mid).map((p) => Markup.button.callback(`$${p}`, `wd_amt:${p}`)));
    }
  }
  if (balance >= minUsd) {
    rows.push([Markup.button.callback(`💰 Max (${formatUsd(balance)})`, `wd_amt:${balance}`)]);
  }
  rows.push([Markup.button.callback('✏️ Custom amount', 'wd_amt_custom')]);
  rows.push([Markup.button.callback('« Cancel', 'cancel')]);
  return Markup.inlineKeyboard(rows);
}

function networkKeyboard() {
  const rows = [];
  for (let i = 0; i < NETWORKS.length; i += 2) {
    const pair = [Markup.button.callback(NETWORKS[i], `wd_net:${NETWORKS[i]}`)];
    if (NETWORKS[i + 1]) pair.push(Markup.button.callback(NETWORKS[i + 1], `wd_net:${NETWORKS[i + 1]}`));
    rows.push(pair);
  }
  rows.push([Markup.button.callback('« Cancel', 'cancel')]);
  return Markup.inlineKeyboard(rows);
}

function confirmKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Confirm withdrawal', 'wd_confirm')],
    [Markup.button.callback('« Cancel', 'cancel')],
  ]);
}

async function presentQuote(ctx, amount) {
  const wd = ctx.session?.wd;
  if (!wd?.network) {
    return ctx.reply(errorMsg('Session expired. Tap Withdraw again.'), mainMenu());
  }
  try {
    const q = await quoteWithdraw({
      currency: 'USDT',
      network: wd.network,
      usdAmount: amount,
      addressRow: { fee_percent: 0, rate_usd: 1 },
    });
    ctx.session.wd = { ...wd, amount: q.requestUsd, quote: q };
    ctx.session.step = 'wd_address';
    await ctx.replyWithMarkdown(
      block([
        '📋 *Withdrawal summary*',
        SEP,
        ...formatQuoteLines(q, 'withdraw'),
        '',
        stepProgress(3, 4, 'Paste your *wallet address*'),
        tip('Double-check network + address — crypto transfers are irreversible'),
      ]),
      cancelInline()
    );
  } catch (e) {
    await ctx.reply(errorMsg(e.message), cancelInline());
  }
}

module.exports = function withdrawHandler(bot) {
  bot.hears(['➖ Withdraw', '📤 Withdraw'], async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply(errorMsg('Please tap /start first.'), mainMenu());

    const min = parseFloat(await getSetting('min_withdraw', String(config.minWithdraw)));
    const bal = parseFloat(user.balance);

    if (bal < min) {
      return ctx.replyWithMarkdown(
        block([
          '➖ *Withdraw*',
          SEP,
          `Minimum: *${formatUsd(min)}*`,
          `Your balance: *${formatUsd(bal)}*`,
          tip('Earn or deposit to reach the minimum'),
        ]),
        mainMenu()
      );
    }

    ctx.session = { step: 'wd_amount', wd: {} };
    await ctx.replyWithMarkdown(
      block([
        '➖ *Withdraw USDT*',
        SEP,
        `Available: *${formatUsd(bal)}*`,
        `Platform minimum: *${formatUsd(min)}*`,
        '',
        stepProgress(1, 4, 'Choose amount to withdraw from balance'),
        '',
        tip('Admin pays manually from Trust wallet after approval'),
      ]),
      amountKeyboard(min, bal)
    );
  });

  bot.action(/^wd_amt:([\d.]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const amount = parseFloat(ctx.match[1]);
    const user = await getUser(ctx.from.id);
    const min = parseFloat(await getSetting('min_withdraw', String(config.minWithdraw)));
    const bal = parseFloat(user?.balance || 0);

    if (isNaN(amount) || amount < min) {
      return ctx.reply(errorMsg(`Minimum is ${formatUsd(min)}`), cancelInline());
    }
    if (amount > bal) {
      return ctx.reply(errorMsg('Insufficient balance.'), cancelInline());
    }

    ctx.session = ctx.session || {};
    ctx.session.wd = { ...(ctx.session.wd || {}), amount };
    ctx.session.step = 'wd_network';

    const text = block([
      '➖ *Withdraw*',
      SEP,
      stepProgress(2, 4, `Amount: *${formatUsd(amount)}*`),
      '',
      'Select *network* for payout:',
      tip('Must match the network of your wallet address'),
    ]);

    try {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...networkKeyboard() });
    } catch (_) {
      await ctx.replyWithMarkdown(text, networkKeyboard());
    }
  });

  bot.action('wd_amt_custom', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = ctx.session || {};
    ctx.session.step = 'wd_amount';
    ctx.session.wd = ctx.session.wd || {};
    await ctx.replyWithMarkdown(
      block([stepProgress(1, 4, 'Type the *USDT amount* to withdraw (e.g. `15`)')]),
      cancelInline()
    );
  });

  bot.action(/^wd_net:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const network = ctx.match[1].toUpperCase();
    const wd = ctx.session?.wd;
    if (!wd?.amount) {
      return ctx.reply(errorMsg('Session expired. Tap Withdraw again.'), mainMenu());
    }
    ctx.session.wd = { ...wd, network };
    await presentQuote(ctx, wd.amount);
  });

  bot.action('wd_confirm', async (ctx) => {
    await ctx.answerCbQuery();
    const wd = ctx.session?.wd;
    if (!wd?.amount || !wd?.network || !wd?.address) {
      return ctx.reply(errorMsg('Session expired. Tap Withdraw again.'), mainMenu());
    }

    try {
      const row = await createWithdrawal({
        userId: ctx.from.id,
        amount: wd.amount,
        network: wd.network,
        address: wd.address,
      });
      ctx.session = {};

      await ctx.replyWithMarkdown(
        success(
          'Withdrawal requested',
          block([
            SEP,
            `Request *#${row.id}*`,
            `Amount: ${formatUsd(row.amount)}`,
            `Network: ${row.network}`,
            `Address: \`${row.address}\``,
            '',
            tip('Admin pays manually — you will get a confirmation'),
          ])
        ),
        mainMenu()
      );

      for (const aid of config.adminIds) {
        try {
          await ctx.telegram.sendMessage(
            aid,
            `📤 Withdrawal #${row.id}\nUser ${ctx.from.id} (@${ctx.from.username || 'n/a'})\n${row.amount} USDT · ${row.network}\n${row.address}`,
            require('../../keyboards/admin').withdrawalActions(row.id)
          );
        } catch (_) {}
      }
    } catch (e) {
      ctx.session = {};
      await ctx.reply(errorMsg(e.message), mainMenu());
    }
  });
};
