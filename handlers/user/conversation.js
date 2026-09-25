const { createAd, topUpBudget, updateAd } = require('../../services/adService');
const { quoteDeposit } = require('../../services/ratesService');
const { createDeposit, createWithdrawal } = require('../../services/financeService');
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

    if (step === 'ad_reward') {
      const reward = parseFloat(text);
      const minR = config.minAdReward || 0.005;
      if (isNaN(reward) || reward < minR) {
        return ctx.reply(errorMsg(`Minimum reward is ${minR} USDT.`), cancelInline());
      }
      ctx.session.ad.reward = reward;
      ctx.session.step = 'ad_budget';
      return ctx.replyWithMarkdown(
        block([stepProgress(4, 4, 'Enter total *budget* in USDT')]),
        cancelInline()
      );
    }

    if (step === 'ad_budget') {
      const budget = parseFloat(text);
      if (isNaN(budget) || budget < ctx.session.ad.reward) {
        return ctx.reply(errorMsg(`Budget must be at least ${ctx.session.ad.reward} USDT.`), cancelInline());
      }
      const feePct = config.adPlatformFeePercent || 0;
      const ad = await createAd({
        ownerId: ctx.from.id,
        title: ctx.session.ad.title,
        url: ctx.session.ad.url,
        type: ctx.session.ad.type || 'website',
        reward: ctx.session.ad.reward,
        budget,
      });
      ctx.session = {};
      const estViews = Math.floor(parseFloat(ad.budget) / parseFloat(ad.reward));
      await ctx.replyWithMarkdown(
        success(
          'Campaign submitted',
          block([
            SEP,
            `ID: *#${ad.id}*`,
            `Title: ${ad.title}`,
            `Reward: ${formatUsd(ad.reward)} / view`,
            `Budget: ${formatUsd(ad.budget)} · ~${estViews} views`,
            feePct ? `Platform fee: ${feePct}% (already deducted)` : null,
            '',
            '_Status: pending admin approval_',
            tip('You will be notified when it goes live'),
          ])
        ),
        mainMenu()
      );
      for (const aid of config.adminIds) {
        try {
          await ctx.telegram.sendMessage(
            aid,
            [
              `🆕 *Campaign review* #${ad.id}`,
              ``,
              `*Title:* ${ad.title}`,
              `*Type:* ${ad.type}`,
              `*URL:* ${ad.url}`,
              `*Reward:* ${ad.reward} USDT / view`,
              `*Budget:* ${ad.budget} USDT`,
              `*Owner:* ${ctx.from.id} (@${ctx.from.username || 'n/a'})`,
              ``,
              `_Open the URL, then Activate or Reject_`,
            ].join('\n'),
            {
              parse_mode: 'Markdown',
              ...require('../../keyboards/admin').adModeration(ad.id),
            }
          );
        } catch (_) {}
      }
      return;
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
        ctx.session.deposit = { ...d, ...q, amount: q.desiredCreditUsd };
        ctx.session.step = 'dep_tx';
        return ctx.replyWithMarkdown(
          block([
            stepProgress(2, 3, `Credit: *${formatUsd(q.desiredCreditUsd)}*`),
            SEP,
            `*Send exactly:*`,
            `*${q.cryptoAmount} ${q.currency}* on *${q.network}*`,
            '',
            `Rate: $${q.priceUsd} · Fee: ${q.feePercent}% ($${q.feeUsd})`,
            `You pay ≈ $${q.payUsd} value → credit *${formatUsd(q.desiredCreditUsd)}*`,
            '',
            '*Address:*',
            '`' + q.address + '`',
            '',
            'After sending, reply with *TxID* (or `skip`):',
          ]),
          cancelInline()
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
          'Deposit submitted',
          block([
            SEP,
            `Request *#${dep.id}*`,
            `Credit: ${formatUsd(dep.amount)}`,
            d.cryptoAmount ? `Sent: ${d.cryptoAmount} ${d.currency} · ${d.network}` : `Network: ${dep.network}`,
            '',
            tip('You will be notified when admin approves'),
          ])
        ),
        mainMenu()
      );
      for (const aid of config.adminIds) {
        try {
          await ctx.telegram.sendMessage(
            aid,
            `📥 Deposit #${dep.id}\nUser ${ctx.from.id} (@${ctx.from.username || 'n/a'})\n${dep.amount} USDT · ${dep.network}\nTx: ${txHash || 'n/a'}`,
            require('../../keyboards/admin').depositActions(dep.id)
          );
        } catch (_) {}
      }
      return;
    }

    if (step === 'wd_amount') {
      const amount = parseFloat(text);
      const min = parseFloat(await getSetting('min_withdraw', String(config.minWithdraw)));
      if (isNaN(amount) || amount < min) {
        return ctx.reply(errorMsg(`Minimum is ${min} USDT.`), cancelInline());
      }
      const user = await getUser(ctx.from.id);
      if (amount > parseFloat(user.balance)) {
        return ctx.reply(errorMsg('Insufficient balance.'), cancelInline());
      }
      ctx.session.wd = { amount };
      ctx.session.step = 'wd_network';
      return ctx.replyWithMarkdown(
        block([stepProgress(2, 3, 'Enter *network* (TRC20 / ERC20 / BEP20)')]),
        cancelInline()
      );
    }

    if (step === 'wd_network') {
      ctx.session.wd.network = text.toUpperCase();
      ctx.session.step = 'wd_address';
      return ctx.replyWithMarkdown(
        block([stepProgress(3, 3, 'Paste your *USDT wallet address*')]),
        cancelInline()
      );
    }

    if (step === 'wd_address') {
      if (text.length < 20) {
        return ctx.reply(errorMsg('That does not look like a valid address.'), cancelInline());
      }
      const wd = await createWithdrawal({
        userId: ctx.from.id,
        amount: ctx.session.wd.amount,
        network: ctx.session.wd.network,
        address: text,
      });
      ctx.session = {};
      await ctx.replyWithMarkdown(
        success(
          'Withdrawal requested',
          block([
            SEP,
            `Request *#${wd.id}*`,
            `Amount: ${formatUsd(wd.amount)}`,
            `Network: ${wd.network}`,
            `Address: \`${wd.address}\``,
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
            `📤 Withdrawal #${wd.id}\nUser ${ctx.from.id}\n${wd.amount} USDT · ${wd.network}\n${wd.address}`,
            require('../../keyboards/admin').withdrawalActions(wd.id)
          );
        } catch (_) {}
      }
      return;
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
