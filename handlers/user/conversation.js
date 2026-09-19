
const { createAd } = require('../../services/adService');
const { createDeposit, createWithdrawal } = require('../../services/financeService');
const { getSetting } = require('../../services/settingsService');
const { getUser } = require('../../services/userService');
const { pool } = require('../../database');
const { formatUsd } = require('../../utils/helpers');
const { mainMenu, cancelInline } = require('../../keyboards/user');
const { Markup } = require('telegraf');
const config = require('../../config');

const MENU = new Set([
  '💰 Balance','👀 Earn (View Ads)','📢 Advertise','👥 Referrals','📥 Deposit','📤 Withdraw',
  '💡 Submit Idea','🆘 Support','📜 Terms','🔒 Privacy','⬅️ Main Menu',
  '📥 Pending Deposits','📤 Pending Withdrawals','📊 Stats','🏦 Treasury','⚙️ CMS Link','🔍 Search User',
]);

async function handleConversation(ctx, next) {
  if (!ctx.message?.text || !ctx.session?.step) return next();
  const text = ctx.message.text.trim();
  if (MENU.has(text) || text.startsWith('/')) { ctx.session = {}; return next(); }
  if (text.toLowerCase() === 'cancel') { ctx.session = {}; return ctx.reply('Cancelled.', mainMenu()); }
  const step = ctx.session.step;
  try {
    if (step === 'ad_title') {
      if (text.length < 3 || text.length > 100) return ctx.reply('Title 3–100 chars.');
      ctx.session.ad = { title: text }; ctx.session.step = 'ad_url';
      return ctx.reply('Send URL (https:// or t.me/…):', cancelInline());
    }
    if (step === 'ad_url') {
      let url = text;
      if (!url.startsWith('http') && !url.startsWith('t.me')) return ctx.reply('Invalid URL');
      if (url.startsWith('t.me')) url = 'https://' + url;
      ctx.session.ad.url = url; ctx.session.step = 'ad_type';
      return ctx.reply('Select type:', Markup.inlineKeyboard([
        [Markup.button.callback('🌐 Website','adtype:website'), Markup.button.callback('🤖 Bot','adtype:bot')],
        [Markup.button.callback('📢 Channel','adtype:channel'), Markup.button.callback('📦 Other','adtype:other')],
      ]));
    }
    if (step === 'ad_reward') {
      const reward = parseFloat(text);
      if (isNaN(reward) || reward < 0.001) return ctx.reply('Min reward 0.001 USDT');
      ctx.session.ad.reward = reward; ctx.session.step = 'ad_budget';
      return ctx.reply('Enter total budget in USDT:', cancelInline());
    }
    if (step === 'ad_budget') {
      const budget = parseFloat(text);
      if (isNaN(budget) || budget < ctx.session.ad.reward) return ctx.reply('Budget must cover reward');
      const ad = await createAd({ ownerId: ctx.from.id, title: ctx.session.ad.title, url: ctx.session.ad.url, type: ctx.session.ad.type || 'website', reward: ctx.session.ad.reward, budget });
      ctx.session = {};
      await ctx.replyWithMarkdown(`✅ Ad #${ad.id} submitted (pending approval)\nReward: ${formatUsd(ad.reward)}\nBudget: ${formatUsd(ad.budget)}`, mainMenu());
      for (const aid of config.adminIds) {
        try { await ctx.telegram.sendMessage(aid, `🆕 Ad #${ad.id} from ${ctx.from.id}: ${ad.title}`, require('../../keyboards/admin').adModeration(ad.id)); } catch(_){}
      }
      return;
    }
    if (step === 'dep_amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < (config.minDeposit || 1)) return ctx.reply(`Min deposit ${config.minDeposit} USDT`);
      ctx.session.deposit.amount = amount; ctx.session.step = 'dep_tx';
      return ctx.reply(`Amount: *${formatUsd(amount)}*\nReply with TxID (or skip):`, { parse_mode: 'Markdown', ...cancelInline() });
    }
    if (step === 'dep_tx') {
      const txHash = text.toLowerCase() === 'skip' ? null : text;
      const dep = await createDeposit({ userId: ctx.from.id, amount: ctx.session.deposit.amount, network: ctx.session.deposit.network, txHash });
      ctx.session = {};
      await ctx.replyWithMarkdown(`✅ Deposit #${dep.id} pending review\n${formatUsd(dep.amount)} · ${dep.network}`, mainMenu());
      for (const aid of config.adminIds) {
        try { await ctx.telegram.sendMessage(aid, `📥 Deposit #${dep.id}\nUser ${ctx.from.id}\n${dep.amount} USDT ${dep.network}\nTx: ${txHash||'n/a'}`, require('../../keyboards/admin').depositActions(dep.id)); } catch(_){}
      }
      return;
    }
    if (step === 'wd_amount') {
      const amount = parseFloat(text);
      const min = parseFloat(await getSetting('min_withdraw', String(config.minWithdraw)));
      if (isNaN(amount) || amount < min) return ctx.reply(`Min ${min} USDT`);
      const user = await getUser(ctx.from.id);
      if (amount > parseFloat(user.balance)) return ctx.reply('Insufficient balance');
      ctx.session.wd = { amount }; ctx.session.step = 'wd_network';
      return ctx.reply('Network (TRC20 / ERC20 / BEP20):', cancelInline());
    }
    if (step === 'wd_network') {
      ctx.session.wd.network = text.toUpperCase(); ctx.session.step = 'wd_address';
      return ctx.reply('Your USDT address:', cancelInline());
    }
    if (step === 'wd_address') {
      if (text.length < 20) return ctx.reply('Invalid address');
      const wd = await createWithdrawal({ userId: ctx.from.id, amount: ctx.session.wd.amount, network: ctx.session.wd.network, address: text });
      ctx.session = {};
      await ctx.replyWithMarkdown(`✅ Withdrawal #${wd.id} pending\n${formatUsd(wd.amount)}\n\`${wd.address}\``, mainMenu());
      for (const aid of config.adminIds) {
        try { await ctx.telegram.sendMessage(aid, `📤 Withdrawal #${wd.id}\nUser ${ctx.from.id}\n${wd.amount} USDT\n${wd.network}\n${wd.address}`, require('../../keyboards/admin').withdrawalActions(wd.id)); } catch(_){}
      }
      return;
    }
    if (step === 'idea_content') {
      if (text.length < 10) return ctx.reply('Write at least 10 characters');
      await pool.query('INSERT INTO ideas (user_id, content) VALUES ($1,$2)', [ctx.from.id, text]);
      ctx.session = {};
      await ctx.reply('✅ Idea submitted. Thank you!', mainMenu());
      for (const aid of config.adminIds) { try { await ctx.telegram.sendMessage(aid, `💡 Idea from ${ctx.from.id}:\n${text.slice(0,500)}`); } catch(_){} }
      return;
    }
    if (step === 'support_msg') {
      if (text.length < 5) return ctx.reply('More detail please');
      await pool.query('INSERT INTO support_tickets (user_id, message) VALUES ($1,$2)', [ctx.from.id, text]);
      ctx.session = {};
      await ctx.reply('✅ Support ticket created.', mainMenu());
      for (const aid of config.adminIds) { try { await ctx.telegram.sendMessage(aid, `🆘 Support ${ctx.from.id}:\n${text.slice(0,800)}`); } catch(_){} }
      return;
    }
  } catch (e) {
    ctx.session = {};
    return ctx.reply(`❌ ${e.message}`, mainMenu());
  }
  return next();
}
module.exports = { handleConversation };
