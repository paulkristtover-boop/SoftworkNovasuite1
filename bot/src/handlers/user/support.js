const { pool } = require('../../database');
const { getSetting } = require('../../services/settingsService');
const { mainMenu, cancelInline } = require('../../keyboards/user');
const config = require('../../config');

module.exports = function supportHandler(bot) {
  bot.hears('🆘 Support', async (ctx) => {
    const supportUser =
      (await getSetting('support_username', '')) || config.supportUsername || '';
    const supportEmail = config.supportEmail || '';

    let text = '🆘 *Support*\n\nDescribe your issue and we will get back to you.';
    if (supportUser) text += `\n\nTelegram: @${supportUser.replace('@', '')}`;
    if (supportEmail) text += `\nEmail: ${supportEmail}`;
    if (config.adminCmsUrl) text += `\n\nAdmin panel: ${config.adminCmsUrl}`;

    ctx.session = { step: 'support_msg' };
    await ctx.reply(text, { parse_mode: 'Markdown', ...cancelInline() });
  });

  bot.on('text', async (ctx, next) => {
    if (ctx.session?.step !== 'support_msg') return next();
    const message = ctx.message.text.trim();
    if (message.length < 5) return ctx.reply('Please provide more details.');

    await pool.query(
      `INSERT INTO support_tickets (user_id, message) VALUES ($1, $2)`,
      [ctx.from.id, message]
    );
    ctx.session = {};
    await ctx.reply('✅ Support ticket created. We will reply as soon as possible.', mainMenu());

    for (const aid of config.adminIds) {
      try {
        await ctx.telegram.sendMessage(
          aid,
          `🆘 Support ticket from ${ctx.from.id} (@${ctx.from.username || 'n/a'}):\n\n${message.slice(0, 800)}`
        );
      } catch (_) {}
    }
  });
};
