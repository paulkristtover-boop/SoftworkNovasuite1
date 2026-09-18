const { Markup } = require('telegraf');

function mainMenu() {
  return Markup.keyboard([
    ['💰 Balance', '👀 Earn (View Ads)'],
    ['📢 Advertise', '👥 Referrals'],
    ['📥 Deposit', '📤 Withdraw'],
    ['💡 Submit Idea', '🆘 Support'],
    ['📜 Terms', '🔒 Privacy'],
  ])
    .resize()
    .persistent();
}

function depositNetworks(addresses) {
  const rows = addresses.map((a) => [Markup.button.callback(`${a.network} (${a.currency})`, `dep_net:${a.id}`)]);
  rows.push([Markup.button.callback('❌ Cancel', 'cancel')]);
  return Markup.inlineKeyboard(rows);
}

function confirmDeposit(amount) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`✅ Confirm ${amount} USDT`, 'dep_confirm')],
    [Markup.button.callback('❌ Cancel', 'cancel')],
  ]);
}

function withdrawConfirm(amount) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`✅ Request ${amount} USDT`, 'wd_confirm')],
    [Markup.button.callback('❌ Cancel', 'cancel')],
  ]);
}

function adActions(adId) {
  return Markup.inlineKeyboard([
    [Markup.button.url('🔗 Open Ad', 'https://t.me')], // placeholder, set real url in handler
    [Markup.button.callback('✅ I Viewed It', `ad_done:${adId}`)],
    [Markup.button.callback('⏭ Skip', 'ad_skip')],
  ]);
}

function backToMenu() {
  return Markup.keyboard([['⬅️ Main Menu']]).resize();
}

function cancelInline() {
  return Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel')]]);
}

module.exports = {
  mainMenu,
  depositNetworks,
  confirmDeposit,
  withdrawConfirm,
  adActions,
  backToMenu,
  cancelInline,
};
