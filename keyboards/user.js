const { Markup } = require('telegraf');

function mainMenu() {
  return Markup.keyboard([
    ['💰 Balance', '👀 Earn (View Ads)'],
    ['📢 Advertise', '👥 Referrals'],
    ['📥 Deposit', '📤 Withdraw'],
    ['💡 Submit Idea', '🆘 Support'],
    ['📜 Terms', '🔒 Privacy'],
  ]).resize().persistent();
}

function depositNetworks(addresses) {
  const rows = addresses.map((a) => [Markup.button.callback(`${a.network} (${a.currency})`, `dep_net:${a.id}`)]);
  rows.push([Markup.button.callback('❌ Cancel', 'cancel')]);
  return Markup.inlineKeyboard(rows);
}

function cancelInline() {
  return Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel')]]);
}

module.exports = { mainMenu, depositNetworks, cancelInline };
