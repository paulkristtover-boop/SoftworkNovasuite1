const config = require('../config');
const userKb = require('../keyboards/user');
const { money, shortId, dt, statusEmoji, escapeHtml } = require('../utils/format');
const deposits = require('../services/deposits');
const withdrawals = require('../services/withdrawals');
const payments = require('../services/payments');
const ideas = require('../services/ideas');
const users = require('../services/users');
const { notifyAdmins } = require('../services/notify');
const session = require('../utils/session');
const adminKb = require('../keyboards/admin');
const { ValidationError, InsufficientBalanceError } = require('../utils/errors');

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
        `✅ <b>Deposit submitted</b>\n\n` +
          `Amount: <b>${money(dep.amount)}</b>\n` +
          `Network: ${dep.network}\n` +
          `TX: <code>${escapeHtml(txHash)}</code>\n` +
          `ID: <code>${dep.id}</code>\n\n` +
          `Status: ⏳ Pending review. You'll be notified when approved.`,
        { parse_mode: 'HTML', ...userKb.mainMenu() }
      );

      const u = ctx.state.user;
      await notifyAdmins(
        ctx,
        `📥 <b>New deposit request</b>\n\n` +
          `User: ${u.first_name || ''} ${u.username ? '@' + u.username : u.telegram_id}\n` +
          `Amount: <b>${money(dep.amount)}</b>\n` +
          `Network: ${dep.network}\n` +
          `TX: <code>${escapeHtml(txHash)}</code>\n` +
          `ID: <code>${dep.id}</code>`,
        adminKb.depositReview(dep.id)
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
        `✅ <b>Withdrawal requested</b>\n\n` +
          `Amount: <b>${money(w.amount)}</b>\n` +
          `Network: ${w.network}\n` +
          `To: <code>${escapeHtml(toAddress)}</code>\n` +
          `ID: <code>${w.id}</code>\n\n` +
          `⏳ Pending admin payment. Funds are reserved from your balance.`,
        { parse_mode: 'HTML', ...userKb.mainMenu() }
      );

      const u = ctx.state.user;
      await notifyAdmins(
        ctx,
        `📤 <b>New withdrawal request</b>\n\n` +
          `User: ${u.first_name || ''} ${u.username ? '@' + u.username : u.telegram_id}\n` +
          `Amount: <b>${money(w.amount)}</b>\n` +
          `Network: ${w.network}\n` +
          `Address: <code>${escapeHtml(toAddress)}</code>\n` +
          `ID: <code>${w.id}</code>\n\n` +
          `<i>Pay manually from Trust Wallet, then Mark Paid.</i>`,
        adminKb.withdrawalReview(w.id)
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
      await notifyAdmins(
        ctx,
        `💡 <b>New idea</b> from ${ctx.state.user.username ? '@' + ctx.state.user.username : ctx.from.id}\n\n` +
          escapeHtml(text.slice(0, 500))
      );
      return true;
    }

    if (s.state === 'support_wait_msg') {
      await session.clearSession(ctx.from.id);
      await ctx.reply('Message received. Our team will get back to you.', userKb.mainMenu());
      await notifyAdmins(
        ctx,
        `🆘 <b>Support message</b> from ${ctx.state.user.username ? '@' + ctx.state.user.username : ctx.from.id}\n\n` +
          escapeHtml(text.slice(0, 1000))
      );
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

async function onCancelCb(ctx) {
  await session.clearSession(ctx.from.id);
  await ctx.answerCbQuery('Cancelled');
  try {
    await ctx.editMessageText('Cancelled.');
  } catch (_) {}
  await ctx.reply('Main menu:', userKb.mainMenu());
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
  onCancelCb,
};
