const { findOrCreateUser } = require('../../services/userService');
const { getSetting } = require('../../services/settingsService');
const { mainMenu } = require('../../keyboards/user');
const { adminMenu } = require('../../keyboards/admin');
const { isAdmin, formatUsd } = require('../../utils/helpers');
const { block, SEP, brandName } = require('../../utils/ui');
const config = require('../../config');

module.exports = function startHandler(bot) {
  bot.start(async (ctx) => {
    const user = await findOrCreateUser(ctx.from, ctx.startPayload || null);
    const name = ctx.from.first_name || 'there';
    const custom = await getSetting('welcome_message', '');

    const welcome = block([
      `👋 *Welcome${name ? `, ${name}` : ''}*`,
      `*${brandName()}* · Earn ${config.currency} with paid tasks`,
      SEP,
      custom ||
        [
          '• *Earn* — view verified ads & get paid',
          '• *Promote* — advertise bots, sites & channels',
          '• *Refer* — invite friends and earn a share',
          '• *Wallet* — deposit & withdraw in USDT',
        ].join('\n'),
      '',
      `_Balance: ${formatUsd(user.balance)}_`,
    ]);

    if (isAdmin(ctx.from.id)) {
      await ctx.replyWithMarkdown(
        block([
          welcome,
          '',
          '🔐 *Admin notifications mode*',
          config.adminCmsUrl ? `CMS: ${config.adminCmsUrl}` : 'Configure ADMIN_CMS_URL for the full dashboard.',
        ]),
        adminMenu()
      );
    } else {
      await ctx.replyWithMarkdown(welcome, mainMenu());
    }
  });

  bot.action('go_home', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = {};
    await ctx.reply('Main menu', mainMenu());
  });
};
