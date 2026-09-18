const { Markup } = require('telegraf');

/**
 * Admin bot UI is deliberately different from user UI:
 * - Compact, action-focused
 * - Notification-centric
 * - No big emoji menu boards
 */
function adminMenu() {
  return Markup.keyboard([
    ['📥 Pending Deposits', '📤 Pending Withdrawals'],
    ['📊 Stats', '🏦 Treasury'],
    ['⚙️ Settings', '🔍 Search User'],
  ])
    .resize()
    .persistent();
}

function depositActions(depositId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Approve', `adm_dep_ok:${depositId}`),
      Markup.button.callback('❌ Reject', `adm_dep_no:${depositId}`),
    ],
  ]);
}

function withdrawalActions(withdrawalId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Mark Paid', `adm_wd_ok:${withdrawalId}`),
      Markup.button.callback('❌ Reject', `adm_wd_no:${withdrawalId}`),
    ],
  ]);
}

function adModeration(adId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Activate', `adm_ad_ok:${adId}`),
      Markup.button.callback('❌ Reject', `adm_ad_no:${adId}`),
    ],
  ]);
}

module.exports = {
  adminMenu,
  depositActions,
  withdrawalActions,
  adModeration,
};
