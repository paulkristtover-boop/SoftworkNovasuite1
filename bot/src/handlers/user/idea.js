const { pool } = require('../../database');
const { mainMenu, cancelInline } = require('../../keyboards/user');
const config = require('../../config');

module.exports = function ideaHandler(bot) {
  bot.hears('💡 Submit Idea', async (ctx) => {
    ctx.session = { step: 'idea_content' };
    await ctx.reply(
      '💡 *Submit an Idea / Feedback*\n\nTell us how we can improve the platform. Your feedback is valuable!',
      { parse_mode: 'Markdown', ...cancelInline() }
    );
  });

  bot.on('text', async (ctx, next) => {
    if (ctx.session?.step !== 'idea_content') return next();
    const content = ctx.message.text.trim();
    if (content.length < 10) return ctx.reply('Please write at least 10 characters.');

    await pool.query(
      `INSERT INTO ideas (user_id, content) VALUES ($1, $2)`,
      [ctx.from.id, content]
    );
    ctx.session = {};
    await ctx.reply('✅ Thank you! Your idea has been submitted and will be reviewed.', mainMenu());

    for (const aid of config.adminIds) {
      try {
        await ctx.telegram.sendMessage(aid, `💡 New idea from ${ctx.from.id}:\n\n${content.slice(0, 500)}`);
      } catch (_) {}
    }
  });
};
