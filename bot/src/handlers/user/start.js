const { findOrCreateUser } = require('../../services/userService');
const { getSetting } = require('../../services/settingsService');
const { mainMenu } = require('../../keyboards/user');
const { isAdmin } = require('../../utils/helpers');
const { adminMenu } = require('../../keyboards/admin');
const config = require('../../config');

module.exports = function startHandler(bot) {
  bot.start(async (ctx) => {
    const payload = ctx.startPayload || ''; // referral code
    const user = await findOrCreateUser(ctx.from, payload || null);

    const welcome = (await getSetting('welcome_message')) ||
      `Welcome to *NovaSuite*! 💰\n\nView ads → earn ${config.currency}\nAdvertise your bots, websites & channels\nInvite friends & earn referral bonuses`;

    if (isAdmin(ctx.from.id)) {
      await ctx.replyWithMarkdown(
        `${welcome}\n\n🔐 *Admin mode detected*\nYou will receive deposit/withdrawal notifications here.\nUse the admin menu below or the Web CMS.`,
        adminMenu()
      );
    } else {
      await ctx.replyWithMarkdown(welcome, mainMenu());
    }
  });
};
