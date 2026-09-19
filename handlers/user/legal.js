const { getSetting } = require('../../services/settingsService');
const { mainMenu } = require('../../keyboards/user');
const config = require('../../config');
module.exports = function legalHandler(bot) {
  bot.hears('📜 Terms', async (ctx) => {
    const url = (await getSetting('terms_url','')) || config.termsUrl || '';
    const text = url ? `📜 *Terms of Use*\n\n${url}` :
      '📜 *Terms of Use*\n\n1. 18+ only.\n2. One account per person.\n3. Fraud / fake views → ban.\n4. Deposits & withdrawals processed manually in USDT.\n5. Platform may change rates.\n6. Third-party ad links are not our responsibility.\n\nBy using the bot you agree to these terms.';
    await ctx.replyWithMarkdown(text, mainMenu());
  });
  bot.hears('🔒 Privacy', async (ctx) => {
    const url = (await getSetting('privacy_url','')) || config.privacyUrl || '';
    const text = url ? `🔒 *Privacy Policy*\n\n${url}` :
      '🔒 *Privacy Policy*\n\n• We store Telegram ID, username, and transaction history.\n• We do not sell your data.\n• Wallet addresses used only for payments.\n• Request deletion via support.\n• Admin actions are audited.';
    await ctx.replyWithMarkdown(text, mainMenu());
  });
};
