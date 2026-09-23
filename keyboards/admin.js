const { Markup } = require('telegraf');

/** Admin UI deliberately different from user UI */
function adminMenu() {
  return Markup.keyboard([
    ['📥 Pending Deposits', '📤 Pending Withdrawals'],
    ['📊 Stats', '📢 Campaigns'],
    ['🏦 Treasury', '🔍 Search User'],
    ['⚙️ CMS Link'],
  ])
    .resize()
    .persistent();
}

function depositActions(id) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Approve', `adm_dep_ok:${id}`),
      Markup.button.callback('❌ Reject', `adm_dep_no:${id}`),
    ],
  ]);
}

function withdrawalActions(id) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Mark Paid', `adm_wd_ok:${id}`),
      Markup.button.callback('❌ Reject', `adm_wd_no:${id}`),
    ],
  ]);
}

function adModeration(id) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Activate', `adm_ad_ok:${id}`),
      Markup.button.callback('❌ Reject', `adm_ad_no:${id}`),
    ],
  ]);
}

module.exports = { adminMenu, depositActions, withdrawalActions, adModeration };
