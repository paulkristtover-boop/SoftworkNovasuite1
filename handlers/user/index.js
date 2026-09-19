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
const { handleConversation } = require('./conversation');
const { mainMenu } = require('../../keyboards/user');

function registerUserHandlers(bot) {
  bot.on('text', handleConversation);
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
  bot.action('cancel', async (ctx) => { await ctx.answerCbQuery(); ctx.session = {}; await ctx.reply('Cancelled.', mainMenu()); });
}
module.exports = { registerUserHandlers };
