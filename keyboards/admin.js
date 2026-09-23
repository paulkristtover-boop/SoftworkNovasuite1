const { Markup } = require('telegraf');

function adminMenu() {
  return Markup.keyboard([
    ['📊 Dashboard', '⏳ Pending Deposits'],
    ['⏳ Pending Withdrawals', '🏦 Trust Wallet'],
    ['📍 Payment Addresses', '💡 Ideas'],
    ['👤 Ban / Unban', '📋 Audit Logs'],
    ['➕ Ledger Adjust', '🏠 User Menu'],
  ])
    .resize()
    .persistent();
}

function depositReview(depositId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Approve', `adm_dep_ok:${depositId}`),
      Markup.button.callback('❌ Reject', `adm_dep_no:${depositId}`),
    ],
  ]);
}

function withdrawalReview(withdrawalId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💸 Mark Paid', `adm_wd_ok:${withdrawalId}`),
      Markup.button.callback('❌ Reject', `adm_wd_no:${withdrawalId}`),
    ],
  ]);
}

function addressActions(id) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✏️ Edit', `adm_addr_edit:${id}`),
      Markup.button.callback('🔄 Toggle', `adm_addr_toggle:${id}`),
    ],
    [Markup.button.callback('🗑 Delete', `adm_addr_del:${id}`)],
  ]);
}

function ideaActions(id) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('👁 Reviewed', `adm_idea:reviewed:${id}`),
      Markup.button.callback('✨ Done', `adm_idea:implemented:${id}`),
    ],
    [Markup.button.callback('📁 Close', `adm_idea:closed:${id}`)],
  ]);
}

module.exports = {
  adminMenu,
  depositReview,
  withdrawalReview,
  addressActions,
  ideaActions,
};
