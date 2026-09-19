const { getSetting } = require('../../services/settingsService');
const { cancelInline } = require('../../keyboards/user');
const { block, SEP, tip } = require('../../utils/ui');
const config = require('../../config');

module.exports = function supportHandler(bot) {
  bot.hears('💬 Support', async (ctx) => {
    const u = (await getSetting('support_username', '')) || config.supportUsername || '';
    const lines = [
      '💬 *Support*',
      SEP,
      'Describe your issue clearly (deposit TxID, withdrawal ID, etc.).',
      '',
    ];
    if (u) lines.push(`Telegram: @${u.replace('@', '')}`);
    if (config.supportEmail) lines.push(`Email: ${config.supportEmail}`);
    lines.push('', tip('Our team will follow up as soon as possible'));

    ctx.session = { step: 'support_msg' };
    await ctx.replyWithMarkdown(block(lines), cancelInline());
  });
};
