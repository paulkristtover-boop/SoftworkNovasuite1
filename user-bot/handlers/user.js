const config = require('../../shared/config');
const userKb = require('../keyboards/user');
const { money, shortId, dt, statusEmoji, escapeHtml } = require('../../shared/utils/format');
const deposits = require('../../shared/services/deposits');
const withdrawals = require('../../shared/services/withdrawals');
const payments = require('../../shared/services/payments');
const ideas = require('../../shared/services/ideas');
const users = require('../../shared/services/users');
const { notifyAdmins } = require('../../shared/services/notify');
const ads = require('../../shared/services/ads');
const referrals = require('../../shared/services/referrals');
const daily = require('../../shared/services/daily');
const session = require('../../shared/utils/session');
const { ValidationError, InsufficientBalanceError } = require('../../shared/utils/errors');

async function balanceHandler(ctx) {
  const user = await users.getByTelegramId(ctx.from.id);
  await ctx.reply(
    `💰 <b>Your Balance</b>\n\n` +
      `<b>${money(user.balance)}</b>\n\n` +
      `Currency: ${config.app.currency}\n` +
      `Account: ${user.username ? '@' + user.username : user.telegram_id}`,
    { parse_mode: 'HTML', ...userKb.mainMenu() }
  );
}

async function depositStart(ctx) {
  const addresses = await payments.listActiveAddresses();
  if (!addresses.length) {
    return ctx.reply(
      '📥 Deposits are temporarily unavailable.\nPlease contact support — no active payment addresses.',
      { ...userKb.mainMenu() }
    );
  }
  await session.setSession(ctx.from.id, 'deposit_choose_network', {});
  await ctx.reply(
    `📥 <b>Deposit ${config.app.currency}</b>\n\n` +
      `Minimum: <b>${config.app.minDeposit} ${config.app.currency}</b>\n\n` +
      `Select the network you will send from:`,
    { parse_mode: 'HTML', ...userKb.depositNetworks(addresses) }
  );
}

async function historyHandler(ctx) {
  const user = ctx.state.user;
  const deps = await deposits.listUserDeposits(user.id, 5);
  const wds = await withdrawals.listUserWithdrawals(user.id, 5);

  let text = `📜 <b>Recent History</b>\n\n`;
  text += `<b>Deposits</b>\n`;
  if (!deps.length) text += `<i>None yet</i>\n`;
  else {
    for (const d of deps) {
      text += `${statusEmoji(d.status)} ${money(d.amount)} · ${d.status} · ${dt(d.created_at)} · #${shortId(d.id)}\n`;
    }
  }
  text += `\n<b>Withdrawals</b>\n`;
  if (!wds.length) text += `<i>None yet</i>\n`;
  else {
    for (const w of wds) {
      text += `${statusEmoji(w.status)} ${money(w.amount)} · ${w.status} · ${dt(w.created_at)} · #${shortId(w.id)}\n`;
    }
  }
  await ctx.reply(text, { parse_mode: 'HTML', ...userKb.mainMenu() });
}

async function withdrawStart(ctx) {
  const user = ctx.state.user;
  if (Number(user.balance) < config.app.minWithdrawal) {
    return ctx.reply(
      `📤 Minimum withdrawal is <b>${config.app.minWithdrawal} ${config.app.currency}</b>.\n` +
        `Your balance: <b>${money(user.balance)}</b>`,
      { parse_mode: 'HTML', ...userKb.mainMenu() }
    );
  }
  await session.setSession(ctx.from.id, 'withdraw_choose_network', {});
  await ctx.reply(
    `📤 <b>Withdraw ${config.app.currency}</b>\n\n` +
      `Balance: <b>${money(user.balance)}</b>\n` +
      `Minimum: <b>${config.app.minWithdrawal} ${config.app.currency}</b>\n\n` +
      `Select destination network:`,
    { parse_mode: 'HTML', ...userKb.withdrawNetworks() }
  );
}

async function supportHandler(ctx) {
  await ctx.reply(
    `🆘 <b>Support</b>\n\n` +
      `We're here to help.\n\n` +
      `• Chat: ${config.app.supportUsername}\n` +
      `• Email: ${config.app.supportEmail}\n\n` +
      `Average response time: within business hours.`,
    { parse_mode: 'HTML', ...userKb.supportLinks() }
  );
}

async function termsHandler(ctx) {
  const termsBody =
    config.app.termsUrl
      ? `Please read our full Terms of Use:\n${config.app.termsUrl}`
      : `By using this bot you agree to use it lawfully, not abuse the service, ` +
        `and understand that deposits/withdrawals are manually reviewed. ` +
        `We are not responsible for wrong network / wrong address transfers.`;

  await ctx.reply(`📄 <b>Terms of Use</b>\n\n${termsBody}`, {
    parse_mode: 'HTML',
    ...userKb.termsKeyboard(),
  });
}

async function privacyHandler(ctx) {
  const body =
    config.app.privacyUrl
      ? `Privacy policy:\n${config.app.privacyUrl}`
      : `We store your Telegram ID, username, balance, and transaction records to operate the service. ` +
        `We do not sell your data. Contact support for data requests.`;

  await ctx.reply(`🔒 <b>Privacy</b>\n\n${body}`, {
    parse_mode: 'HTML',
    ...userKb.mainMenu(),
  });
}

async function ideaStart(ctx) {
  await session.setSession(ctx.from.id, 'idea_wait_text', {});
  await ctx.reply(
    `💡 <b>Submit an Idea</b>\n\nTell us what would make this service better.\n` +
      `Type your feedback in one message (min 10 characters).`,
    { parse_mode: 'HTML', ...userKb.cancelKeyboard() }
  );
}

async function acceptTermsCallback(ctx) {
  await users.acceptTerms(ctx.state.user.id);
  ctx.state.user.accepted_terms = true;
  await ctx.answerCbQuery('Terms accepted. Thank you!');
  await ctx.editMessageText('✅ Terms accepted. You can use all features now.');
  await ctx.reply('Main menu:', userKb.mainMenu());
}

// ——— Text state machine ———
async function handleTextState(ctx) {
  const text = (ctx.message && ctx.message.text) || '';
  if (text === '❌ Cancel') {
    await session.clearSession(ctx.from.id);
    return ctx.reply('Cancelled.', userKb.mainMenu());
  }

  const s = ctx.state.session || (await session.getSession(ctx.from.id));
  if (!s.state) return false;

  try {
    if (s.state === 'deposit_wait_amount') {
      const amount = Number(text.replace(',', '.'));
      if (!amount || amount < config.app.minDeposit) {
        await ctx.reply(`Enter a valid amount ≥ ${config.app.minDeposit} ${config.app.currency}.`);
        return true;
      }
      await session.setSession(ctx.from.id, 'deposit_wait_tx', {
        ...s.data,
        amount,
      });
      const addr = s.data.address;
      await ctx.reply(
        `📥 <b>Send exactly</b> <code>${amount}</code> <b>${config.app.currency}</b>\n\n` +
          `Network: <b>${addr.network}</b>\n` +
          `Address:\n<code>${addr.address}</code>\n\n` +
          (addr.instructions ? `${escapeHtml(addr.instructions)}\n\n` : '') +
          `After sending, reply with the <b>transaction hash / ID</b>.`,
        { parse_mode: 'HTML', ...userKb.cancelKeyboard() }
      );
      return true;
    }

    if (s.state === 'deposit_wait_tx') {
      const txHash = text.trim();
      const dep = await deposits.createDeposit({
        userId: ctx.state.user.id,
        amount: s.data.amount,
        network: s.data.address.network,
        txHash,
        paymentAddressId: s.data.address.id,
      });
      await session.clearSession(ctx.from.id);

      await ctx.reply(
        `✅ <b>Success — deposit submitted</b>\n\n` +
          `Amount: <b>${money(dep.amount)}</b>\n` +
          `Network: ${dep.network}\n` +
          `TX: <code>${escapeHtml(txHash)}</code>\n` +
          `ID: <code>${dep.id}</code>\n\n` +
          `Status: ⏳ Pending review. You'll be notified when approved.`,
        { parse_mode: 'HTML', ...userKb.mainMenu() }
      );

      const u = ctx.state.user;
      await notifyAdmins(`📥 <b>New deposit request</b>\n\n` +
          `User: ${u.first_name || ''} ${u.username ? '@' + u.username : u.telegram_id}\n` +
          `Amount: <b>${money(dep.amount)}</b>\n` +
          `Network: ${dep.network}\n` +
          `TX: <code>${escapeHtml(txHash)}</code>\n` +
          `ID: <code>${dep.id}</code>`
      );
      return true;
    }

    if (s.state === 'withdraw_wait_amount') {
      const amount = Number(text.replace(',', '.'));
      if (!amount || amount < config.app.minWithdrawal) {
        await ctx.reply(`Enter a valid amount ≥ ${config.app.minWithdrawal} ${config.app.currency}.`);
        return true;
      }
      if (amount > Number(ctx.state.user.balance)) {
        await ctx.reply(`Insufficient balance. You have ${money(ctx.state.user.balance)}.`);
        return true;
      }
      await session.setSession(ctx.from.id, 'withdraw_wait_address', {
        ...s.data,
        amount,
      });
      await ctx.reply(
        `📤 Send <b>${money(amount)}</b> to which address?\n\n` +
          `Network: <b>${s.data.network}</b>\n` +
          `Paste your ${s.data.network} wallet address:`,
        { parse_mode: 'HTML', ...userKb.cancelKeyboard() }
      );
      return true;
    }

    if (s.state === 'withdraw_wait_address') {
      const toAddress = text.trim();
      const w = await withdrawals.createWithdrawal({
        userId: ctx.state.user.id,
        amount: s.data.amount,
        network: s.data.network,
        toAddress,
      });
      await session.clearSession(ctx.from.id);
      // refresh balance in state
      ctx.state.user = await users.getByTelegramId(ctx.from.id);

      await ctx.reply(
        `✅ <b>Success — withdrawal requested</b>\n\n` +
          `Amount: <b>${money(w.amount)}</b>\n` +
          `Network: ${w.network}\n` +
          `To: <code>${escapeHtml(toAddress)}</code>\n` +
          `ID: <code>${w.id}</code>\n\n` +
          `⏳ Pending admin payment. Funds are reserved from your balance.`,
        { parse_mode: 'HTML', ...userKb.mainMenu() }
      );

      const u = ctx.state.user;
      await notifyAdmins(`📤 <b>New withdrawal request</b>\n\n` +
          `User: ${u.first_name || ''} ${u.username ? '@' + u.username : u.telegram_id}\n` +
          `Amount: <b>${money(w.amount)}</b>\n` +
          `Network: ${w.network}\n` +
          `Address: <code>${escapeHtml(toAddress)}</code>\n` +
          `ID: <code>${w.id}</code>\n\n` +
          `<i>Pay manually from Trust Wallet, then Mark Paid.</i>`
      );
      return true;
    }

    if (s.state === 'idea_wait_text') {
      const idea = await ideas.submitIdea(ctx.state.user.id, text);
      await session.clearSession(ctx.from.id);
      await ctx.reply(
        `💡 Thanks! Your idea was submitted (#${idea.id}). Our team will review it.`,
        userKb.mainMenu()
      );
      await notifyAdmins(`💡 <b>New idea</b> from ${ctx.state.user.username ? '@' + ctx.state.user.username : ctx.from.id}\n\n` +
          escapeHtml(text.slice(0, 500))
      );
      return true;
    }

    if (s.state === 'support_wait_msg') {
      await session.clearSession(ctx.from.id);
      await ctx.reply('Message received. Our team will get back to you.', userKb.mainMenu());
      await notifyAdmins(`🆘 <b>Support message</b> from ${ctx.state.user.username ? '@' + ctx.state.user.username : ctx.from.id}\n\n` +
          escapeHtml(text.slice(0, 1000))
      );
      return true;
    }

    if (s.state === 'ad_wait_title') {
      const title = text.trim();
      if (title.length < 3) {
        await ctx.reply('Title too short (min 3 characters).');
        return true;
      }
      await session.setSession(ctx.from.id, 'ad_wait_url', { ...s.data, title });
      await ctx.reply(
        'Paste the <b>link</b> (t.me/…, website, channel):',
        { parse_mode: 'HTML', ...userKb.cancelKeyboard() }
      );
      return true;
    }

    if (s.state === 'ad_wait_url') {
      const targetUrl = text.trim();
      if (targetUrl.length < 5) {
        await ctx.reply('Please send a valid link.');
        return true;
      }
      await session.setSession(ctx.from.id, 'ad_wait_budget', { ...s.data, targetUrl });
      const settings = await ads.getSettings();
      await ctx.reply(
        `Enter <b>campaign budget</b> in USDT (min ${settings.min_campaign_budget}).
Locked from your balance until the campaign ends or is rejected.
Tip: higher reward/view = faster delivery.`,
        { parse_mode: 'HTML', ...userKb.cancelKeyboard() }
      );
      return true;
    }

    if (s.state === 'ad_wait_budget') {
      const budget = Number(text.replace(',', '.'));
      const settings = await ads.getSettings();
      if (!budget || budget < Number(settings.min_campaign_budget)) {
        await ctx.reply(`Enter a valid budget ≥ ${settings.min_campaign_budget} USDT.`);
        return true;
      }
      if (budget > Number(ctx.state.user.balance)) {
        await ctx.reply(`Insufficient balance. You have ${money(ctx.state.user.balance)}.`);
        return true;
      }
      await session.setSession(ctx.from.id, 'ad_wait_reward', { ...s.data, budget });
      const def = settings.default_reward;
      const est = Math.floor(budget / Number(def));
      await ctx.reply(
        `Reward per view in USDT?
Range: ${settings.min_reward_per_view} – ${settings.max_reward_per_view}
Default: <b>${def}</b> — send <code>default</code> to use it.

Example: budget ${budget} ÷ ${def} ≈ <b>${est}</b> views`,
        { parse_mode: 'HTML', ...userKb.cancelKeyboard() }
      );
      return true;
    }

    if (s.state === 'ad_wait_reward') {
      const settings = await ads.getSettings();
      let reward = Number(settings.default_reward);
      if (text.trim().toLowerCase() !== 'default') {
        reward = Number(text.replace(',', '.'));
      }
      try {
        const camp = await ads.createCampaign({
          advertiserId: ctx.state.user.id,
          adType: s.data.adType,
          title: s.data.title,
          targetUrl: s.data.targetUrl,
          budgetTotal: s.data.budget,
          rewardPerView: reward,
        });
        await session.clearSession(ctx.from.id);
        ctx.state.user = await users.getByTelegramId(ctx.from.id);
        const est = camp.estimated_views || Math.floor(Number(camp.budget_total) / Number(camp.reward_per_view));
        await ctx.reply(
          `✅ <b>Campaign submitted successfully!</b>

Title: <b>${escapeHtml(camp.title)}</b>
Type: ${camp.ad_type}
Link: ${escapeHtml(camp.target_url)}
Budget: <b>${money(camp.budget_total)}</b>
Reward/view: <b>${money(camp.reward_per_view)}</b>
Est. views: ~${est}
Status: ⏳ <b>Pending admin approval</b>
ID: <code>${camp.id}</code>

You'll be notified when it goes live.`,
          { parse_mode: 'HTML', ...userKb.mainMenu() }
        );
        await notifyAdmins(
          `📢 <b>New ad campaign</b>

User: ${ctx.state.user.username ? '@' + ctx.state.user.username : ctx.from.id}
Type: ${camp.ad_type}
Title: ${escapeHtml(camp.title)}
URL: ${escapeHtml(camp.target_url)}
Budget: ${money(camp.budget_total)} · Reward: ${money(camp.reward_per_view)}
Est. views: ~${est}
ID: <code>${camp.id}</code>`
        );
      } catch (err) {
        await session.clearSession(ctx.from.id);
        await ctx.reply(err.message || 'Could not create campaign.', userKb.mainMenu());
      }
      return true;
    }

  } catch (err) {
    await session.clearSession(ctx.from.id);
    const msg =
      err instanceof ValidationError || err instanceof InsufficientBalanceError
        ? err.message
        : 'Could not process your request. Try again.';
    await ctx.reply(msg, userKb.mainMenu());
    return true;
  }

  return false;
}

async function onDepositNetwork(ctx) {
  const id = Number(ctx.match[1]);
  const addr = await payments.getAddressById(id);
  if (!addr || !addr.is_active) {
    await ctx.answerCbQuery('Address unavailable');
    return;
  }
  await session.setSession(ctx.from.id, 'deposit_wait_amount', { address: addr });
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Network: <b>${addr.network}</b>\n` +
      `Label: ${addr.label || '—'}\n\n` +
      `Enter the amount in ${config.app.currency} to deposit (min ${config.app.minDeposit}):`,
    { parse_mode: 'HTML' }
  );
  await ctx.reply('Type the amount:', userKb.cancelKeyboard());
}

async function onWithdrawNetwork(ctx) {
  const network = ctx.match[1];
  await session.setSession(ctx.from.id, 'withdraw_wait_amount', { network });
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Network: <b>${network}</b>\n\nEnter amount in ${config.app.currency} (min ${config.app.minWithdrawal}):`,
    { parse_mode: 'HTML' }
  );
  await ctx.reply('Type the amount:', userKb.cancelKeyboard());
}

async function onSupportMsg(ctx) {
  await session.setSession(ctx.from.id, 'support_wait_msg', {});
  await ctx.answerCbQuery();
  await ctx.reply('Type your message to support:', userKb.cancelKeyboard());
}

async function onCancel(ctx) {
  const session = require('../../shared/utils/session');
  await session.clearSession(ctx.from.id);
  await ctx.reply('Cancelled.', require('../keyboards/user').mainMenu());
}

async function onCancelCb(ctx) {
  await session.clearSession(ctx.from.id);
  await ctx.answerCbQuery('Cancelled');
  try {
    await ctx.editMessageText('Cancelled.');
  } catch (_) {}
  await ctx.reply('Main menu:', userKb.mainMenu());
}


/* ── SoftworkNovaSuite PTC ── */

async function earnStart(ctx) {
  const list = await ads.listActiveForViewer(ctx.state.user.id, 1);
  if (!list.length) {
    return ctx.reply(
      '💵 <b>Earn</b>

No ads available right now. Check back later, or deposit & advertise your own project!',
      { parse_mode: 'HTML', ...userKb.mainMenu() }
    );
  }
  const c = list[0];
  const left = Math.max(0, Number(c.budget_total) - Number(c.budget_spent));
  const text =
    `💵 <b>Earn USDT</b>

` +
    `<b>${escapeHtml(c.title)}</b>
` +
    `Type: ${c.ad_type}
` +
    (c.description ? `${escapeHtml(c.description.slice(0, 200))}
` : '') +
    `Reward: <b>${money(c.reward_per_view)}</b> · Campaign budget left: ${money(Number(c.budget_total) - Number(c.budget_spent))} · Budget left: ${money(left)}

` +
    `1. 🔗 Open link
2. ⏱ Start timer
3. ✅ Claim reward`;
  await ctx.reply(text, {
    parse_mode: 'HTML',
    ...userKb.adViewKeyboard(c.id, c.target_url),
  });
}

async function onAdClaim(ctx) {
  const id = ctx.match[1];
  await ctx.answerCbQuery();
  try {
    const result = await ads.recordView(id, ctx.state.user.id);
    ctx.state.user = await users.getByTelegramId(ctx.from.id);
    await ctx.editMessageText(
      `✅ <b>Success! Reward claimed</b>\n\nEarned: <b>+${money(result.reward)}</b>\nBalance: <b>${money(ctx.state.user.balance)}</b>`,
      { parse_mode: 'HTML' }
    );
    await ctx.reply('✅ Success. Tap 💵 Earn for the next ad.', userKb.mainMenu());
  } catch (err) {
    const msg = err.message || 'Could not claim reward.';
    try {
      await ctx.editMessageText(`❌ ${msg}`);
    } catch (_) {
      await ctx.reply(`❌ ${msg}`, userKb.mainMenu());
    }
  }
}

async function onAdSkip(ctx) {
  await ctx.answerCbQuery('Skipped');
  try {
    await ctx.editMessageText('Skipped. Use 💵 Earn for the next ad.');
  } catch (_) {}
  await earnStart(ctx);
}

async function advertiseStart(ctx) {
  const settings = await ads.getSettings();
  const def = settings.default_reward;
  const viewsForMin = Math.floor(Number(settings.min_campaign_budget) / Number(def || 0.001));
  await ctx.reply(
    `📢 <b>Advertise on SoftworkNovaSuite</b>

Promote your <b>bot, website, channel or group</b>.

• Budget locked from your balance (refunded if rejected)
• Min budget: <b>${money(settings.min_campaign_budget)}</b>
• Pay viewers: <b>${settings.min_reward_per_view}–${settings.max_reward_per_view}</b> USDT/view
• Default ~<b>${money(def)}</b>/view → about <b>${viewsForMin}+</b> views at min budget
• Admin approves before the ad goes live

Select ad type:`,
    { parse_mode: 'HTML', ...userKb.adTypeKeyboard() }
  );
}

async function onAdType(ctx) {
  const adType = ctx.match[1];
  await ctx.answerCbQuery();
  await session.setSession(ctx.from.id, 'ad_wait_title', { adType });
  await ctx.reply(
    `Type selected: <b>${adType}</b>\n\nSend a short <b>title</b> for your ad:`,
    { parse_mode: 'HTML', ...userKb.cancelKeyboard() }
  );
}

async function myAdsHandler(ctx) {
  const list = await ads.listUserCampaigns(ctx.state.user.id, 10);
  const stats = await ads.earningsStats(ctx.state.user.id);
  let text =
    `📊 <b>My Ads & Earnings</b>\n\n` +
    `Total earned from viewing: <b>${money(stats.total_earned)}</b> (${stats.views} views)\n\n`;
  if (!list.length) {
    text += `<i>You have no campaigns yet. Tap 📢 Advertise to create one.</i>`;
  } else {
    for (const c of list) {
      text +=
        `• <b>${escapeHtml(c.title)}</b> (${c.ad_type})\n` +
        `  ${c.status} · spent ${money(c.budget_spent)} / ${money(c.budget_total)} · ${c.views_count} views\n`;
    }
  }
  await ctx.reply(text, { parse_mode: 'HTML', ...userKb.mainMenu() });
}

async function onAdCancel(ctx) {
  await session.clearSession(ctx.from.id);
  await ctx.answerCbQuery('Cancelled');
  try {
    await ctx.editMessageText('Cancelled.');
  } catch (_) {}
  await ctx.reply('Main menu:', userKb.mainMenu());
}



async function onAdOpen(ctx) {
  const id = ctx.match[1];
  await ctx.answerCbQuery('Timer started — open the link, wait, then claim');
  try {
    await ads.openClaimSession(id, ctx.state.user.id);
    const settings = await ads.getSettings();
    const sec = settings.claim_delay_seconds || 15;
    await ctx.reply(
      `⏱ Timer started (${sec}s).
1. Open the link above
2. Wait ${sec} seconds
3. Tap ✅ Claim reward`
    );
  } catch (e) {
    await ctx.reply(e.message || 'Could not start timer.');
  }
}

async function referralsHandler(ctx) {
  const code = await users.ensureReferralCode(ctx.state.user.id);
  const stats = await referrals.referralStats(ctx.state.user.id);
  const settings = await ads.getSettings();
  const botInfo = await ctx.telegram.getMe();
  const link = `https://t.me/${botInfo.username}?start=ref_${code}`;
  await ctx.reply(
    `👥 <b>Referrals</b>

` +
      `Your code: <code>${code}</code>
` +
      `Invite link:
<code>${link}</code>

` +
      `• Your bonus per invite: <b>${money(settings.referral_signup_bonus || 0.05)}</b> per friend
` +
      `• Friend gets welcome bonus: <b>${money(settings.referral_welcome_bonus || 0.02)}</b>
• You earn <b>${settings.referral_earn_percent || 5}%</b> of their ad earnings

` +
      `Friends referred: <b>${stats.referred}</b>
` +
      `Total referral rewards: <b>${money(stats.totalRewards)}</b>`,
    { parse_mode: 'HTML', ...userKb.mainMenu() }
  );
}

async function dailyBonusHandler(ctx) {
  try {
    const r = await daily.claimDailyBonus(ctx.state.user.id);
    ctx.state.user = await users.getByTelegramId(ctx.from.id);
    await ctx.reply(
      `🎁 <b>Daily bonus claimed!</b>

` +
        `+<b>${money(r.amount)}</b>
` +
        `Streak: <b>${r.streak}</b> day(s)
` +
        `Balance: <b>${money(ctx.state.user.balance)}</b>`,
      { parse_mode: 'HTML', ...userKb.mainMenu() }
    );
  } catch (e) {
    await ctx.reply(`🎁 ${e.message}`, userKb.mainMenu());
  }
}

async function leaderboardHandler(ctx) {
  const list = await ads.leaderboard(10);
  let text = `🏆 <b>Top earners</b>

`;
  if (!list.length) text += '<i>No data yet</i>';
  else {
    list.forEach((u, i) => {
      const name = u.username ? '@' + u.username : (u.first_name || u.telegram_id);
      const lvl = users.LEVEL_LABELS[u.level] || u.level;
      text += `${i + 1}. ${name} — <b>${money(u.total_earned)}</b> · Lv ${u.level} (${lvl})
`;
    });
  }
  const me = ctx.state.user;
  text += `
You: <b>${money(me.total_earned || 0)}</b> · Level ${me.level || 1} (${users.LEVEL_LABELS[me.level || 1] || 'Starter'}) · ${me.total_views || 0} views`;
  await ctx.reply(text, { parse_mode: 'HTML', ...userKb.mainMenu() });
}


module.exports = {
  balanceHandler,
  depositStart,
  historyHandler,
  withdrawStart,
  supportHandler,
  termsHandler,
  privacyHandler,
  ideaStart,
  acceptTermsCallback,
  handleTextState,
  onDepositNetwork,
  onWithdrawNetwork,
  onSupportMsg,
  onCancel,
  onCancelCb,
  onAdCancel,
  myAdsHandler,
  onAdType,
  advertiseStart,
  onAdSkip,
  onAdClaim,
  earnStart,
  leaderboardHandler,
  dailyBonusHandler,
  referralsHandler,
  onAdOpen,
};
