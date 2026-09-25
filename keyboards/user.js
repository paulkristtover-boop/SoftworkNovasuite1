const { Markup } = require('telegraf');

function mainMenu() {
  return Markup.keyboard([
    ['💼 Wallet', '⚡ Earn'],
    ['📣 Promote', '👥 Refer'],
    ['➕ Deposit', '➖ Withdraw'],
    ['💡 Ideas', '💬 Support'],
    ['ℹ️ Info'],
  ])
    .resize()
    .persistent();
}

function infoMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📜 Terms of Use', 'info_terms'), Markup.button.callback('🔒 Privacy', 'info_privacy')],
    [Markup.button.callback('❓ How it works', 'info_how')],
    [Markup.button.callback('« Main menu', 'go_home')],
  ]);
}

function depositNetworks(addresses) {
  const rows = addresses.map((a) => {
    const label = a.label ? `${a.network} · ${a.label}` : `${a.network} (${a.currency || 'USDT'})`;
    return [Markup.button.callback(label, `dep_net:${a.id}`)];
  });
  rows.push([Markup.button.callback('« Cancel', 'cancel')]);
  return Markup.inlineKeyboard(rows);
}

function cancelInline() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('« Cancel', 'cancel')],
    [Markup.button.callback('« Main menu', 'go_home')],
  ]);
}

function earnAdKeyboard(adId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('▶ Start verified view', `ad_start:${adId}`)],
    [Markup.button.callback('Skip', 'ad_skip')],
    [Markup.button.callback('« Main menu', 'go_home')],
  ]);
}

function earnViewingKeyboard(adId, url) {
  return Markup.inlineKeyboard([
    [Markup.button.url('🔗 Open ad link', url)],
    [Markup.button.callback('✓ I completed the view', `ad_done:${adId}`)],
    [Markup.button.callback('Skip', 'ad_skip'), Markup.button.callback('« Menu', 'go_home')],
  ]);
}

function earnNextKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Next ad →', 'ad_next')],
    [Markup.button.callback('« Main menu', 'go_home')],
  ]);
}

function adTypeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🌐 Website', 'adtype:website'), Markup.button.callback('🤖 Bot', 'adtype:bot')],
    [Markup.button.callback('📢 Channel', 'adtype:channel'), Markup.button.callback('🎵 Music', 'adtype:music')],
    [Markup.button.callback('📦 Other', 'adtype:other')],
    [Markup.button.callback('« Cancel', 'cancel')],
  ]);
}

function promoteMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ New campaign', 'promote_new')],
    [Markup.button.callback('📋 My campaigns', 'my_campaigns')],
    [Markup.button.callback('« Main menu', 'go_home')],
  ]);
}

function joinKeyboard() {
  const config = require('../config');
  const channelUrl = config.channelUrl || 'https://t.me/SoftworkNovaSuite';
  const groupUrl = config.groupUrl || 'https://t.me/softworknovasuitecommunity';
  return Markup.inlineKeyboard([
    [Markup.button.url('1️⃣ Join channel', channelUrl)],
    [Markup.button.url('2️⃣ Join group', groupUrl)],
    [Markup.button.callback('✅ 3️⃣ Verify membership', 'verify_join')],
  ]);
}

function backHome() {
  return Markup.inlineKeyboard([[Markup.button.callback('« Main menu', 'go_home')]]);
}

module.exports = {
  mainMenu,
  infoMenu,
  depositNetworks,
  cancelInline,
  earnAdKeyboard,
  earnViewingKeyboard,
  earnNextKeyboard,
  adTypeKeyboard,
  promoteMenu,
  backHome,
  joinKeyboard,
};
