const { Markup } = require('telegraf');
const config = require('../config');

function mainMenu() {
  return Markup.keyboard([
    ['💰 Balance', '📥 Deposit'],
    ['📤 Withdraw', '📜 History'],
    ['💡 Submit Idea', '🆘 Support'],
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

function confirmDeposit(amount, network) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ I sent it — Submit TX', 'dep_confirm'),
      Markup.button.callback('❌ Cancel', 'dep_cancel'),
    ],
  ]);
}

function withdrawNetworks() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('TRC20 (Tron)', 'wd_net:TRC20')],
    [Markup.button.callback('ERC20 (Ethereum)', 'wd_net:ERC20')],
    [Markup.button.callback('BEP20 (BSC)', 'wd_net:BEP20')],
    [Markup.button.callback('❌ Cancel', 'wd_cancel')],
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
  confirmDeposit,
  withdrawNetworks,
  supportLinks,
  termsKeyboard,
};
