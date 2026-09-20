const { cancelInline, mainMenu, backHome } = require('../../keyboards/user');
const { block, SEP, tip } = require('../../utils/ui');
const { Markup } = require('telegraf');

module.exports = function ideaHandler(bot) {
  bot.hears('💡 Ideas', async (ctx) => {
    await ctx.replyWithMarkdown(
      block([
        '💡 *Ideas & feedback*',
        SEP,
        'Help shape NovaSuite — features, rewards, UX, ads, anything.',
        '',
        tip('We read every submission in the Admin CMS'),
      ]),
      Markup.inlineKeyboard([
        [Markup.button.callback('✍️ Write an idea', 'idea_start')],
        [Markup.button.callback('« Main menu', 'go_home')],
      ])
    );
  });

  bot.action('idea_start', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = { step: 'idea_content' };
    await ctx.replyWithMarkdown(
      block([
        '✍️ *Share your idea*',
        SEP,
        'Send one clear message (at least 10 characters).',
        '',
        tip('You can cancel anytime'),
      ]),
      cancelInline()
    );
  });
};
