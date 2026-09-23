const { Markup } = require('telegraf');
const config = require('../../shared/config');

function mainMenu() {
  return Markup.keyboard([
    ['💵 Earn', '📢 Advertise'],
    ['🎁 Daily Bonus', '👥 Referrals'],
    ['💰 Balance', '📥 Deposit'],
    ['📤 Withdraw', '🏆 Leaderboard'],
    ['📊 My Ads', '🆘 Support'],
    ['📄 Terms', '🔒 Privacy'],
  ])
    .resize()
    .persistent();
}

function cancelKeyboard() {
  return Markup.keyboard([['❌ Cancel']]).resize().oneTime();
}

function depositNetworks(addresses) {
  const rows = addresses.map((a) => [
    Markup.button.callback(`${a.network} · ${a.label || a.currency}`, `dep_net:${a.id}`),
  ]);
  rows.push([Markup.button.callback('❌ Cancel', 'dep_cancel')]);
  return Markup.inlineKeyboard(rows);
}

function withdrawNetworks() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('TRC20 (Tron)', 'wd_net:TRC20')],
    [Markup.button.callback('ERC20 (Ethereum)', 'wd_net:ERC20')],
    [Markup.button.callback('BEP20 (BSC)', 'wd_net:BEP20')],
    [Markup.button.callback('❌ Cancel', 'wd_cancel')],
  ]);
}

function adTypeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🤖 Telegram Bot', 'ad_type:bot')],
    [Markup.button.callback('🌐 Website', 'ad_type:website')],
    [Markup.button.callback('📢 Channel', 'ad_type:channel')],
    [Markup.button.callback('👥 Group', 'ad_type:group')],
    [Markup.button.callback('📦 Other', 'ad_type:other')],
    [Markup.button.callback('❌ Cancel', 'ad_cancel')],
  ]);
}

function adViewKeyboard(campaignId, url) {
  return Markup.inlineKeyboard([
    [Markup.button.url('🔗 Open link', url)],
    [Markup.button.callback('⏱ Start timer', `ad_open:${campaignId}`)],
    [Markup.button.callback('✅ Claim reward', `ad_claim:${campaignId}`)],
    [Markup.button.callback('⏭ Skip', 'ad_skip')],
  ]);
}

function supportLinks() {
  const buttons = [];
  if (config.app.supportUsername) {
    buttons.push([
      Markup.button.url(
        '💬 Chat Support',
        `https://t.me/${config.app.supportUsername.replace('@', '')}`
      ),
    ]);
  }
  if (config.app.supportEmail) {
    buttons.push([Markup.button.url('📧 Email', `mailto:${config.app.supportEmail}`)]);
  }
  buttons.push([Markup.button.callback('📝 Message in bot', 'support_msg')]);
  return Markup.inlineKeyboard(buttons);
}

function termsKeyboard() {
  const rows = [];
  if (config.app.termsUrl) {
    rows.push([Markup.button.url('📄 Full Terms', config.app.termsUrl)]);
  }
  rows.push([Markup.button.callback('✅ I Accept Terms', 'accept_terms')]);
  return Markup.inlineKeyboard(rows);
}

module.exports = {
  mainMenu,
  cancelKeyboard,
  depositNetworks,
  withdrawNetworks,
  adTypeKeyboard,
  adViewKeyboard,
  supportLinks,
  termsKeyboard,
};
