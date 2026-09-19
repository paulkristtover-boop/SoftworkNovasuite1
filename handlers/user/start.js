const { findOrCreateUser } = require('../../services/userService');
const { getSetting } = require('../../services/settingsService');
const { mainMenu } = require('../../keyboards/user');
const { adminMenu } = require('../../keyboards/admin');
const { isAdmin } = require('../../utils/helpers');
const config = require('../../config');

module.exports = function startHandler(bot) {
  bot.start(async (ctx) => {
    const user = await findOrCreateUser(ctx.from, ctx.startPayload || null);
    const welcome =
      (await getSetting('welcome_message')) ||
      `Welcome to *${config.platformName}*! 💰\n\nView ads → earn ${config.currency}\nAdvertise bots, websites & channels\nInvite friends for referral bonuses`;
    if (isAdmin(ctx.from.id)) {
      await ctx.replyWithMarkdown(
        `${welcome}\n\n🔐 *Admin mode* — notifications only.\nFull tools: ${config.adminCmsUrl || 'Admin CMS'}`,
        adminMenu()
      );
    } else {
      await ctx.replyWithMarkdown(welcome, mainMenu());
    }
  });
};
