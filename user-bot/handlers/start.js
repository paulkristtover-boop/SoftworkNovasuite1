const userKb = require('../keyboards/user');
const config = require('../../shared/config');
const { money } = require('../../shared/utils/format');
const referrals = require('../../shared/services/referrals');
const users = require('../../shared/services/users');
const { notifyAdmins, notifyUser } = require('../../shared/services/notify');

function extractRefPayload(ctx) {
  // Telegraf: /start ref_CODE or deep link payload
  let payload = '';
  if (ctx.startPayload) payload = String(ctx.startPayload);
  else if (ctx.message?.text) {
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length > 1) payload = parts.slice(1).join(' ');
  }
  payload = payload.trim();
  if (payload.startsWith('ref_')) return payload.slice(4);
  if (payload.startsWith('ref')) return payload.slice(3);
  return payload;
}

async function startHandler(ctx) {
  let user = ctx.state.user;
  const name = user.first_name || user.username || 'there';
  const code = extractRefPayload(ctx);

  if (code && !user.referred_by) {
    try {
      const r = await referrals.applyReferral(user.id, code);
      user = await users.getByTelegramId(ctx.from.id);
      ctx.state.user = user;

      // Success for new joiner
      await ctx.reply(
        `🎉 <b>Welcome bonus unlocked!</b>\n\n` +
          `You joined with a referral link.\n` +
          `• Your welcome bonus: <b>+${money(r.welcomeBonus)}</b>\n` +
          `• Your balance: <b>${money(user.balance)}</b>\n\n` +
          `Your friend also received a referral reward. Start earning with <b>💵 Earn</b>!`,
        { parse_mode: 'HTML' }
      );

      // Notify referrer
      if (r.referrer?.telegram_id && r.referrerBonus > 0) {
        await notifyUser(
          r.referrer.telegram_id,
          `👥 <b>New referral!</b>\n\n` +
            `${name} joined with your link.\n` +
            `You received <b>+${money(r.referrerBonus)}</b>\n` +
            `Keep sharing to earn more.`
        );
      }

      // Notify admins so they know bonuses were paid
      await notifyAdmins(
        `👥 <b>Referral activated</b>\n\n` +
          `New user: ${name} (${user.telegram_id})\n` +
          `Referrer: ${r.referrer.username ? '@' + r.referrer.username : r.referrer.telegram_id}\n` +
          `Referrer bonus: <b>${money(r.referrerBonus)}</b>\n` +
          `Welcome bonus (joiner): <b>${money(r.welcomeBonus)}</b>\n` +
          `Code: <code>${code}</code>`
      );
    } catch (e) {
      // Silent for invalid/already used — still show welcome
      if (e.message && !/already used/i.test(e.message) && !/Invalid/i.test(e.message)) {
        console.error('[start] referral error:', e.message);
      }
    }
  }

  const u = ctx.state.user;
  const welcome = `
👋 <b>Welcome to SoftworkNovaSuite, ${name}!</b>

PTC platform — <b>earn USDT</b> viewing ads & <b>advertise</b> bots, sites, channels.

• Balance: <b>${money(u.balance)}</b>
• Level: <b>${u.level || 1}</b> (${users.LEVEL_LABELS[u.level || 1] || 'Starter'})
• Min deposit: ${config.app.minDeposit} USDT

<b>💵 Earn</b> · <b>📢 Advertise</b> · <b>🎁 Daily Bonus</b> · <b>👥 Referrals</b>
`.trim();

  await ctx.reply(welcome, {
    parse_mode: 'HTML',
    ...userKb.mainMenu(),
  });

  if (!u.accepted_terms) {
    await ctx.reply(
      '📄 Please review and accept our Terms of Use to continue.',
      { parse_mode: 'HTML', ...userKb.termsKeyboard() }
    );
  }
}

module.exports = { startHandler };
