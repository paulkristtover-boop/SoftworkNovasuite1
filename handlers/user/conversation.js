const { createAd, topUpBudget, updateAd } = require('../../services/adService');
const { quoteDeposit, quoteWithdraw, formatQuoteLines } = require('../../services/ratesService');
const { createDeposit } = require('../../services/financeService');
const { getSetting } = require('../../services/settingsService');
const { getUser } = require('../../services/userService');
const { pool } = require('../../database');
const { formatUsd } = require('../../utils/helpers');
const { mainMenu, cancelInline, adTypeKeyboard } = require('../../keyboards/user');
const { block, SEP, stepProgress, tip, success, errorMsg } = require('../../utils/ui');
const config = require('../../config');

const MENU = new Set([
  '💼 Wallet',
  '⚡ Earn',
  '📣 Promote',
  '👥 Refer',
  '➕ Deposit',
  '➖ Withdraw',
  '💡 Ideas',
  '💬 Support',
  'ℹ️ Info',
  // legacy labels (if session mid-update)
  '💰 Balance',
  '👀 Earn (View Ads)',
  '📢 Advertise',
  '👥 Referrals',
  '📥 Deposit',
  '📤 Withdraw',
  '💡 Submit Idea',
  '🆘 Support',
  '📜 Terms',
  '🔒 Privacy',
  '⬅️ Main Menu',
  '📥 Pending Deposits',
  '📤 Pending Withdrawals',
  '📊 Stats',
  '📢 Campaigns',
  '🏦 Treasury',
  '⚙️ CMS Link',
  '⚙️ Settings',
  '🔍 Search User',
]);

async function handleConversation(ctx, next) {
  if (!ctx.message?.text || !ctx.session?.step) return next();

  const text = ctx.message.text.trim();
  if (MENU.has(text) || text.startsWith('/')) {
    ctx.session = {};
    return next();
  }
  if (text.toLowerCase() === 'cancel') {
    ctx.session = {};
    return ctx.reply('Cancelled.', mainMenu());
  }

  const step = ctx.session.step;

  try {
    if (step === 'ad_title') {
      if (text.length < 3 || text.length > 100) {
        return ctx.reply(errorMsg('Title must be 3–100 characters.'), cancelInline());
      }
      ctx.session.ad = { title: text };
      ctx.session.step = 'ad_url';
      return ctx.replyWithMarkdown(
        block([stepProgress(2, 4, 'Send the *URL* (https:// or t.me/…)')]),
        cancelInline()
      );
    }

    if (step === 'ad_url') {
      let url = text.trim();
      // Accept https, http, t.me, spotify:, open.spotify.com without scheme
      if (url.startsWith('t.me')) url = 'https://' + url;
      if (url.startsWith('open.spotify.com') || url.startsWith('spotify.com')) url = 'https://' + url;
      if (url.startsWith('spotify:')) {
        // keep deep link — Telegram url buttons need https; convert common form
        url = url.replace(/^spotify:track:/, 'https://open.spotify.com/track/')
                 .replace(/^spotify:album:/, 'https://open.spotify.com/album/')
                 .replace(/^spotify:playlist:/, 'https://open.spotify.com/playlist/')
                 .replace(/^spotify:artist:/, 'https://open.spotify.com/artist/');
      }
      if (!/^https?:\/\//i.test(url)) {
        return ctx.reply(errorMsg('Send a full link (https://… or open.spotify.com/…)'), cancelInline());
      }
      ctx.session.ad.url = url;
      ctx.session.step = 'ad_type';
      return ctx.replyWithMarkdown(block([stepProgress(2, 4, 'Select campaign *type*')]), adTypeKeyboard());
    }

    if (step === 'ad_desc') {
      if (text.toLowerCase() === 'skip') {
        ctx.session.ad.description = null;
      } else if (text.length > 300) {
        return ctx.reply(errorMsg('Description max 300 characters (or type skip).'), cancelInline());
      } else {
        ctx.session.ad.description = text;
      }
      ctx.session.step = 'ad_reward';
      return ctx.replyWithMarkdown(
        block([
          stepProgress(4, 6, 'Enter *reward per view* in USDT'),
          `Min ${config.minAdReward || 0.005} · Max ${config.maxAdReward || 1}`,
        ]),
        cancelInline()
      );
    }

    if (step === 'ad_reward') {
      const reward = parseFloat(text);
      const minR = config.minAdReward || 0.005;
      const maxR = config.maxAdReward || 1;
      if (isNaN(reward) || reward < minR || reward > maxR) {
        return ctx.reply(errorMsg(`Reward must be ${minR}–${maxR} USDT.`), cancelInline());
      }
      ctx.session.ad.reward = reward;
      ctx.session.step = 'ad_budget';
      return ctx.replyWithMarkdown(
        block([stepProgress(5, 6, 'Enter total *budget* in USDT (covers multiple views)')]),
        cancelInline()
      );
    }

    if (step === 'ad_budget') {
      const budget = parseFloat(text);
      if (isNaN(budget) || budget < ctx.session.ad.reward) {
        return ctx.reply(errorMsg(`Budget must be at least ${ctx.session.ad.reward} USDT.`), cancelInline());
      }
      const feePct = config.adPlatformFeePercent || 0;
      const fee = Math.round(budget * (feePct / 100) * 1e6) / 1e6;
      const estViews = Math.floor(budget / ctx.session.ad.reward);
      ctx.session.ad.budget = budget;
      ctx.session.step = 'ad_confirm_wait';
      return ctx.replyWithMarkdown(
        block([
          '📋 *Confirm campaign*',
          SEP,
          stepProgress(6, 6, 'Review before debit'),
          `*Title:* ${ctx.session.ad.title}`,
          `*Type:* ${ctx.session.ad.type || 'website'}`,
          ctx.session.ad.description ? `*Desc:* ${String(ctx.session.ad.description).slice(0, 80)}` : null,
          `*URL:* ${ctx.session.ad.url}`,
          `*Reward:* ${formatUsd(ctx.session.ad.reward)} / view`,
          `*Budget:* ${formatUsd(budget)} · ~${estViews} views`,
          feePct ? `*Fee:* ${feePct}% (${formatUsd(fee)})` : null,
          `*Total debit:* ${formatUsd(budget + fee)}`,
          '',
          tip('Pending admin approval after submit'),
        ]),
        require('telegraf').Markup.inlineKeyboard([
          [require('telegraf').Markup.button.callback('✅ Submit campaign', 'ad_confirm')],
          [require('telegraf').Markup.button.callback('« Cancel', 'cancel')],
        ])
      );
    }

    if (step === 'dep_amount') {
      const usd = parseFloat(text);
      const d = ctx.session.deposit || {};
      try {
        const q = await quoteDeposit({
          currency: d.currency,
          network: d.network,
          usdAmount: usd,
          addressRow: d,
        });
        ctx.session.deposit = { ...d, ...q, amount: q.creditUsd || q.desiredCreditUsd };
        ctx.session.step = 'dep_confirm_wait';
        return ctx.replyWithMarkdown(
          block([
            '📋 *Payment summary*',
            SEP,
            ...formatQuoteLines(q, 'deposit'),
            '',
            tip('Confirm to reveal the deposit address'),
          ]),
          require('telegraf').Markup.inlineKeyboard([
            [require('telegraf').Markup.button.callback('✅ Confirm & show address', 'dep_confirm')],
            [require('telegraf').Markup.button.callback('« Cancel', 'cancel')],
          ])
        );
      } catch (e) {
        return ctx.reply(errorMsg(e.message), cancelInline());
      }
    }

    if (step === 'dep_tx') {
      const txHash = text.toLowerCase() === 'skip' ? null : text;
      const d = ctx.session.deposit;
      const dep = await createDeposit({
        userId: ctx.from.id,
        amount: d.amount || d.desiredCreditUsd,
        network: d.network,
        txHash,
        currency: d.currency,
        cryptoAmount: d.cryptoAmount,
        note: d.cryptoAmount
          ? `Expect ${d.cryptoAmount} ${d.currency} (credit $${d.desiredCreditUsd || d.amount})`
          : null,
      });
      ctx.session = {};
      await ctx.replyWithMarkdown(
        success(
          dep.status === 'approved' ? 'Deposit credited' : 'Deposit submitted',
          block([
            SEP,
            `Request *#${dep.id}*`,
            dep.net_amount != null
              ? `Credit: ${formatUsd(dep.net_amount)}${dep.tax_amount > 0 ? ` (tax ${formatUsd(dep.tax_amount)})` : ''}`
              : `Credit: ${formatUsd(dep.amount)}`,
            d.cryptoAmount ? `Sent: ${d.cryptoAmount} ${d.currency} · ${d.network}` : `Network: ${dep.network}`,
            dep.auto_verified ? '_Auto-verified on-chain_' : null,
            '',
            dep.status === 'approved'
              ? tip('Funds are in your wallet')
              : tip('You will be notified when admin approves'),
          ])
        ),
        mainMenu()
      );
      if (dep.status !== 'approved') {
        for (const aid of config.adminIds) {
          try {
            await ctx.telegram.sendMessage(
              aid,
              `📥 Deposit #${dep.id}\nUser ${ctx.from.id} (@${ctx.from.username || 'n/a'})\n${dep.amount} USDT · ${dep.network}\nTx: ${txHash || 'n/a'}`,
              require('../../keyboards/admin').depositActions(dep.id)
            );
          } catch (_) {}
        }
      } else {
        for (const aid of config.adminIds) {
          try {
            await ctx.telegram.sendMessage(
              aid,
              `✅ Auto-deposit #${dep.id}\nUser ${ctx.from.id}\n${dep.net_amount || dep.amount} USDT · ${dep.network}\nTx: ${txHash}`
            );
          } catch (_) {}
        }
      }
      return;
    }

    if (step === 'wd_amount') {
      const amount = parseFloat(text);
      const min = parseFloat(await getSetting('min_withdraw', String(config.minWithdraw)));
      if (isNaN(amount) || amount < min) {
        return ctx.reply(errorMsg(`Minimum is ${formatUsd(min)}.`), cancelInline());
      }
      const user = await getUser(ctx.from.id);
      if (amount > parseFloat(user.balance)) {
        return ctx.reply(errorMsg('Insufficient balance.'), cancelInline());
      }
      ctx.session.wd = { ...(ctx.session.wd || {}), amount };
      ctx.session.step = 'wd_network';
      const { Markup } = require('telegraf');
      const NETWORKS = ['TRC20', 'BEP20', 'ERC20', 'SOL', 'TON'];
      const rows = [];
      for (let i = 0; i < NETWORKS.length; i += 2) {
        const pair = [Markup.button.callback(NETWORKS[i], `wd_net:${NETWORKS[i]}`)];
        if (NETWORKS[i + 1]) pair.push(Markup.button.callback(NETWORKS[i + 1], `wd_net:${NETWORKS[i + 1]}`));
        rows.push(pair);
      }
      rows.push([Markup.button.callback('« Cancel', 'cancel')]);
      return ctx.replyWithMarkdown(
        block([
          '➖ *Withdraw*',
          SEP,
          stepProgress(2, 4, `Amount: *${formatUsd(amount)}*`),
          '',
          'Select *network* for payout:',
          tip('Must match the network of your wallet address'),
        ]),
        Markup.inlineKeyboard(rows)
      );
    }

    if (step === 'wd_address') {
      const addr = text.trim();
      if (addr.length < 20 || addr.length > 128) {
        return ctx.reply(errorMsg('That does not look like a valid wallet address.'), cancelInline());
      }
      // Basic network-aware shape checks
      const net = (ctx.session.wd?.network || '').toUpperCase();
      if (net === 'TRC20' && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) {
        return ctx.reply(errorMsg('TRC20 addresses start with T and are 34 characters.'), cancelInline());
      }
      if ((net === 'ERC20' || net === 'BEP20') && !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        return ctx.reply(errorMsg(`${net} addresses are 0x + 40 hex characters.`), cancelInline());
      }

      const wd = ctx.session.wd || {};
      ctx.session.wd = { ...wd, address: addr };
      ctx.session.step = 'wd_confirm_wait';

      let quoteLines = [];
      try {
        const q = await quoteWithdraw({
          currency: 'USDT',
          network: wd.network,
          usdAmount: wd.amount,
          addressRow: { fee_percent: 0, rate_usd: 1 },
        });
        quoteLines = formatQuoteLines(q, 'withdraw');
      } catch (_) {
        quoteLines = [
          `*From balance:* ${formatUsd(wd.amount)}`,
          `*Network:* ${wd.network}`,
        ];
      }

      return ctx.replyWithMarkdown(
        block([
          '📋 *Confirm withdrawal*',
          SEP,
          ...quoteLines,
          `*Address:* \`${addr}\``,
          '',
          stepProgress(4, 4, 'Review and confirm'),
          tip('Funds are held from your balance until admin pays or rejects'),
        ]),
        require('telegraf').Markup.inlineKeyboard([
          [require('telegraf').Markup.button.callback('✅ Confirm withdrawal', 'wd_confirm')],
          [require('telegraf').Markup.button.callback('« Cancel', 'cancel')],
        ])
      );
    }

    
    if (step === 'camp_topup_amt') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply(errorMsg('Enter a valid USDT amount.'), cancelInline());
      }
      try {
        const ad = await topUpBudget(ctx.session.campId, ctx.from.id, amount);
        ctx.session = {};
        return ctx.replyWithMarkdown(
          success(
            'Budget topped up',
            block([
              SEP,
              `#${ad.id} · ${ad.title}`,
              `Added: ${formatUsd(ad.topUp)} · Fee: ${formatUsd(ad.feeAmount)}`,
              `New budget: *${formatUsd(ad.budget)}*`,
              ad.status === 'pending' ? '_May need re-approval if was finished_' : null,
            ])
          ),
          mainMenu()
        );
      } catch (e) {
        ctx.session = {};
        return ctx.reply(errorMsg(e.message), mainMenu());
      }
    }

    if (step === 'camp_edit_url') {
      let url = text.trim();
      if (url.startsWith('t.me')) url = 'https://' + url;
      if (url.startsWith('open.spotify.com')) url = 'https://' + url;
      if (!/^https?:\/\//i.test(url)) {
        return ctx.reply(errorMsg('Send a full https:// link'), cancelInline());
      }
      try {
        const ad = await updateAd(ctx.session.campId, ctx.from.id, { url });
        ctx.session = {};
        return ctx.replyWithMarkdown(
          success(
            'Campaign updated',
            block([
              SEP,
              `#${ad.id} · status *${ad.status}*`,
              ad.url,
              ad.status === 'pending' ? '_Sent for admin re-approval_' : null,
            ])
          ),
          mainMenu()
        );
      } catch (e) {
        ctx.session = {};
        return ctx.reply(errorMsg(e.message), mainMenu());
      }
    }

    if (step === 'idea_content') {
      if (text.length < 10) {
        return ctx.reply(errorMsg('Please write a bit more (10+ characters).'), cancelInline());
      }
      await pool.query(`INSERT INTO ideas (user_id, content) VALUES ($1, $2)`, [ctx.from.id, text]);
      ctx.session = {};
      await ctx.replyWithMarkdown(success('Idea received', tip('Thank you — we review every submission')), mainMenu());
      for (const aid of config.adminIds) {
        try {
          await ctx.telegram.sendMessage(aid, `💡 Idea from ${ctx.from.id}:\n\n${text.slice(0, 500)}`);
        } catch (_) {}
      }
      return;
    }

    if (step === 'support_msg') {
      if (text.length < 5) {
        return ctx.reply(errorMsg('Please add more detail.'), cancelInline());
      }
      await pool.query(`INSERT INTO support_tickets (user_id, message) VALUES ($1, $2)`, [ctx.from.id, text]);
      ctx.session = {};
      await ctx.replyWithMarkdown(
        success('Ticket created', tip('You will get a Telegram message when support replies · check My tickets anytime')),
        mainMenu()
      );
      for (const aid of config.adminIds) {
        try {
          await ctx.telegram.sendMessage(
            aid,
            `🆘 Support from ${ctx.from.id} (@${ctx.from.username || 'n/a'}):\n\n${text.slice(0, 800)}`
          );
        } catch (_) {}
      }
      return;
    }
  } catch (e) {
    ctx.session = {};
    return ctx.reply(errorMsg(e.message), mainMenu());
  }

  return next();
}

module.exports = { handleConversation };
