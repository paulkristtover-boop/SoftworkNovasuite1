const userKb = require('../keyboards/user');
const config = require('../../shared/config');
const { money } = require('../../shared/utils/format');
const referrals = require('../../shared/services/referrals');
const users = require('../../shared/services/users');
const { notifyAdmins, notifyUser } = require('../../shared/services/notify');

function extractRefPayload(ctx) {
  let payload = '';
  if (ctx.startPayload) payload = String(ctx.startPayload);
  else if (ctx.message?.text) {
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length > 1) payload = parts.slice(1).join(' ');
  }
  payload = payload.trim();
  if (!payload) return '';
  // t.me/bot?start=ref_CODE  or  /start CODE  or  /start ref_CODE
  if (/^ref[_-]?/i.test(payload)) {
    return payload.replace(/^ref[_-]?/i, '');
  }
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

      await ctx.reply(
        `✅ <b>Referral success</b>\n\n` +
          `Welcome bonus credited: <b>+${money(r.welcomeBonus)}</b>\n` +
          `Your balance: <b>${money(user.balance)}</b>\n\n` +
          `Your inviter also received <b>+${money(r.referrerBonus)}</b>.\n` +
          `Tap <b>💵 Earn</b> to start making USDT.`,
        { parse_mode: 'HTML' }
      );

      if (r.referrer?.telegram_id && Number(r.referrerBonus) > 0) {
        await notifyUser(
          r.referrer.telegram_id,
          `✅ <b>Referral success</b>\n\n` +
            `<b>${name}</b> joined with your link.\n` +
            `You received <b>+${money(r.referrerBonus)}</b>.`
        );
      }

      await notifyAdmins(
        `✅ <b>Referral paid</b>\n\n` +
          `Joiner: ${name} (<code>${user.telegram_id}</code>)\n` +
          `Inviter: ${r.referrer.username ? '@' + r.referrer.username : r.referrer.telegram_id}\n` +
          `Joiner welcome: <b>${money(r.welcomeBonus)}</b>\n` +
          `Inviter bonus: <b>${money(r.referrerBonus)}</b>\n` +
          `Code: <code>${code}</code>`
      );
    } catch (e) {
      const msg = e.message || 'Could not apply referral';
      // Always tell the new user (and admin on unexpected errors)
      if (/already used/i.test(msg)) {
        await ctx.reply('ℹ️ You already used a referral code on this account.', { parse_mode: 'HTML' });
      } else if (/Invalid/i.test(msg)) {
        await ctx.reply(`ℹ️ Referral code not found. You can still use the bot — balance: <b>${money(user.balance)}</b>`, {
          parse_mode: 'HTML',
        });
      } else {
        await ctx.reply(`⚠️ Referral could not be applied: ${msg}`);
        await notifyAdmins(
          `⚠️ <b>Referral failed</b>\n\nUser: ${name} (${user.telegram_id})\nCode: <code>${code}</code>\nError: ${msg}`
        ).catch(() => {});
      }
    }
  }

  const u = ctx.state.user;
  const welcome = `
👋 <b>Welcome to SoftworkNovaSuite, ${name}!</b>

Earn USDT by viewing ads · Advertise bots, sites & channels.

• Balance: <b>${money(u.balance)}</b>
• Level: <b>${u.level || 1}</b> (${users.LEVEL_LABELS[u.level || 1] || 'Starter'})

<b>💵 Earn</b> · <b>📢 Advertise</b> · <b>🎁 Daily</b> · <b>👥 Referrals</b>
`.trim();

  await ctx.reply(welcome, {
    parse_mode: 'HTML',
    ...userKb.mainMenu(),
  });

  if (!u.accepted_terms) {
    await ctx.reply(
      '📄 Please accept the Terms of Use to continue.',
      { parse_mode: 'HTML', ...userKb.termsKeyboard() }
    );
  }
}

module.exports = { startHandler };
