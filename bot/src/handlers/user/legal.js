const { getSetting } = require('../../services/settingsService');
const { mainMenu } = require('../../keyboards/user');
const config = require('../../config');

module.exports = function legalHandler(bot) {
  bot.hears('📜 Terms', async (ctx) => {
    const url = (await getSetting('terms_url', '')) || config.termsUrl || '';
    const text = url
      ? `📜 *Terms of Use*\n\nPlease read our terms:\n${url}`
      : `📜 *Terms of Use*\n\n` +
        `1. You must be 18+ to use this platform.\n` +
        `2. One account per person. Multiple accounts may be banned.\n` +
        `3. Fraudulent activity (fake views, bots) results in permanent ban.\n` +
        `4. Deposits & withdrawals are processed manually by admin in USDT.\n` +
        `5. Platform reserves the right to modify rates and features.\n` +
        `6. We are not responsible for third-party links in ads.\n\n` +
        `By using the bot you agree to these terms.`;
    await ctx.replyWithMarkdown(text, mainMenu());
  });

  bot.hears('🔒 Privacy', async (ctx) => {
    const url = (await getSetting('privacy_url', '')) || config.privacyUrl || '';
    const text = url
      ? `🔒 *Privacy Policy*\n\n${url}`
      : `🔒 *Privacy Policy*\n\n` +
        `• We store your Telegram ID, username and transaction history.\n` +
        `• We do not sell your data to third parties.\n` +
        `• Wallet addresses you submit are used only for payments.\n` +
        `• You can request data deletion by contacting support.\n` +
        `• Admin actions are logged for security and audit.`;
    await ctx.replyWithMarkdown(text, mainMenu());
  });
};
