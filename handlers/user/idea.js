const { cancelInline } = require('../../keyboards/user');
module.exports = function ideaHandler(bot) {
  bot.hears('💡 Submit Idea', async (ctx) => {
    ctx.session = { step: 'idea_content' };
    await ctx.reply('💡 *Submit Idea / Feedback*\n\nTell us how to improve:', { parse_mode: 'Markdown', ...cancelInline() });
  });
};
