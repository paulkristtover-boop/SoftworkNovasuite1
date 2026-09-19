const { cancelInline } = require('../../keyboards/user');
const { block, SEP, tip } = require('../../utils/ui');

module.exports = function ideaHandler(bot) {
  bot.hears('💡 Ideas', async (ctx) => {
    ctx.session = { step: 'idea_content' };
    await ctx.replyWithMarkdown(
      block([
        '💡 *Share an idea*',
        SEP,
        'Tell us what would make NovaSuite better — features, UX, rewards, anything.',
        '',
        tip('Write at least a short paragraph · we read every submission'),
      ]),
      cancelInline()
    );
  });
};
