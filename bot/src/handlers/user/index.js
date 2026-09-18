const startHandler = require('./start');
const balanceHandler = require('./balance');
const earnHandler = require('./earn');
const advertiseHandler = require('./advertise');
const referralHandler = require('./referral');
const depositHandler = require('./deposit');
const withdrawHandler = require('./withdraw');
const ideaHandler = require('./idea');
const supportHandler = require('./support');
const legalHandler = require('./legal');

function registerUserHandlers(bot) {
  startHandler(bot);
  balanceHandler(bot);
  earnHandler(bot);
  advertiseHandler(bot);
  referralHandler(bot);
  depositHandler(bot);
  withdrawHandler(bot);
  ideaHandler(bot);
  supportHandler(bot);
  legalHandler(bot);

  // Cancel helper
  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = {};
    await ctx.reply('Cancelled.', require('../../keyboards/user').mainMenu());
  });

  bot.hears('⬅️ Main Menu', async (ctx) => {
    ctx.session = {};
    await ctx.reply('Main menu', require('../../keyboards/user').mainMenu());
  });
}

module.exports = { registerUserHandlers };
