const { getSetting } = require('../../services/settingsService');
const { cancelInline } = require('../../keyboards/user');
const config = require('../../config');
module.exports = function supportHandler(bot) {
  bot.hears('🆘 Support', async (ctx) => {
    const u = (await getSetting('support_username','')) || config.supportUsername || '';
    let t = '🆘 *Support*\n\nDescribe your issue.';
    if (u) t += `\n\nTelegram: @${u.replace('@','')}`;
    if (config.supportEmail) t += `\nEmail: ${config.supportEmail}`;
    ctx.session = { step: 'support_msg' };
    await ctx.reply(t, { parse_mode: 'Markdown', ...cancelInline() });
  });
};
