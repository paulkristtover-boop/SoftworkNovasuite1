const { getSetting } = require('../../services/settingsService');
const { mainMenu, infoMenu, backHome } = require('../../keyboards/user');
const { block, SEP, brandName } = require('../../utils/ui');
const config = require('../../config');

module.exports = function legalHandler(bot) {
  bot.hears('ℹ️ Info', async (ctx) => {
    const channel = (await getSetting('channel_url', '')) || config.channelUrl || 'https://t.me/SoftworkNovaSuite';
    const group = (await getSetting('group_url', '')) || config.groupUrl || 'https://t.me/softworknovasuitecommunity';
    await ctx.replyWithMarkdown(
      block([
        `ℹ️ *${brandName()} Info*`,
        SEP,
        'Choose a topic below.',
        '',
        `📢 Channel: ${channel}`,
        `💬 Group: ${group}`,
      ]),
      infoMenu()
    );
  });

  bot.action('info_terms', async (ctx) => {
    await ctx.answerCbQuery();
    const url = (await getSetting('terms_url', '')) || config.termsUrl || '';
    const text = url
      ? block(['📜 *Terms of Use*', SEP, url])
      : block([
          '📜 *Terms of Use*',
          SEP,
          '1. You must be 18+ to use this platform.',
          '2. One account per person.',
          '3. Fraud, fake views, or abuse results in a ban.',
          '4. Deposits & withdrawals are processed in USDT after review.',
          '5. Rates and limits may change.',
          '6. Third-party ad links are not operated by us.',
          '',
          'By using the bot you agree to these terms.',
        ]);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...backHome() }).catch(async () => {
      await ctx.replyWithMarkdown(text, mainMenu());
    });
  });

  bot.action('info_privacy', async (ctx) => {
    await ctx.answerCbQuery();
    const url = (await getSetting('privacy_url', '')) || config.privacyUrl || '';
    const text = url
      ? block(['🔒 *Privacy Policy*', SEP, url])
      : block([
          '🔒 *Privacy Policy*',
          SEP,
          '• We store Telegram ID, username, and transaction history.',
          '• We do not sell your personal data.',
          '• Wallet addresses are used only for payments.',
          '• Request data deletion via Support.',
          '• Admin actions are recorded in audit logs.',
        ]);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...backHome() }).catch(async () => {
      await ctx.replyWithMarkdown(text, mainMenu());
    });
  });

  bot.action('info_how', async (ctx) => {
    await ctx.answerCbQuery();
    const text = block([
      '❓ *How it works*',
      SEP,
      '1. *Earn* — open ads, wait the required time, get USDT.',
      '2. *Promote* — pay from balance to run your own campaigns.',
      '3. *Refer* — share your link and earn a % of friends’ rewards.',
      '4. *Deposit* — send USDT, submit TxID, wait for approval.',
      '5. *Withdraw* — request payout; admin pays to your wallet.\n\n_Tip: Telegram does not support the phone Back button inside bots — use « Main menu or Cancel on screen._',
    ]);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...backHome() }).catch(async () => {
      await ctx.replyWithMarkdown(text, mainMenu());
    });
  });
};
