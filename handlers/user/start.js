const { findOrCreateUser, getUser } = require('../../services/userService');
const { getSetting } = require('../../services/settingsService');
const { maybeGrantWelcomeBonus, welcomeBonusStatus } = require('../../services/welcomeBonus');
const { communityLinks } = require('../../services/membershipService');
const { mainMenu } = require('../../keyboards/user');
const { adminMenu } = require('../../keyboards/admin');
const { isAdmin, formatUsd } = require('../../utils/helpers');
const { block, SEP, brandName, tip } = require('../../utils/ui');
const { Markup } = require('telegraf');
const config = require('../../config');

module.exports = function startHandler(bot) {
  bot.start(async (ctx) => {
    // Private chats only
    if (ctx.chat?.type && ctx.chat.type !== 'private') return;

    const { user, isNew } = await findOrCreateUser(ctx.from, ctx.startPayload || null);
    const name = ctx.from.first_name || 'there';
    const custom = await getSetting('welcome_message', '');
    const { channelUrl, groupUrl } = communityLinks();

    // Welcome bonus for first 30 (referred or direct) — starter credit for Earn + Advertise
    let bonusLine = null;
    if (isNew) {
      const bonus = await maybeGrantWelcomeBonus(user.telegram_id);
      if (bonus.granted) {
        bonusLine = [
          `🎁 *Welcome starter credit:* +${formatUsd(bonus.amount)}`,
          `_For the first ${bonus.limit} members · ${bonus.remaining} left_`,
          `_Use it to start *Earn* or *Promote* (advertise)_`,
        ].join('\n');
      } else if (bonus.reason === 'sold_out') {
        bonusLine = '_Welcome starter pool is full (first 30 claimed)._';
      }
    } else {
      const status = await welcomeBonusStatus();
      if (status.active) {
        // existing user who never got bonus (edge) — try once
        const bonus = await maybeGrantWelcomeBonus(user.telegram_id);
        if (bonus.granted) {
          bonusLine = `🎁 *Welcome starter credit:* +${formatUsd(bonus.amount)} · use for Earn or Promote`;
        }
      }
    }

    const fresh = await getUser(user.telegram_id);
    const bal = fresh?.balance ?? user.balance;

    const welcome = block([
      `👋 *Welcome${name ? `, ${name}` : ''}*`,
      `*${brandName()}* · Earn ${config.currency} · Promote · Referrals`,
      SEP,
      custom ||
        [
          '• *Earn* — view verified ads & get paid',
          '• *Promote* — advertise bots, sites & channels',
          '• *Refer* — invite friends and earn a share',
          '• *Wallet* — deposit & withdraw in USDT',
        ].join('\n'),
      bonusLine ? '' : null,
      bonusLine,
      '',
      `_Balance: ${formatUsd(bal)}_`,
      '',
      tip('This bot works in private chat only — not in the community'),
    ]);

    if (isAdmin(ctx.from.id)) {
      await ctx.replyWithMarkdown(
        block([
          welcome,
          '',
          '🔐 *Admin notifications mode*',
          config.adminCmsUrl ? `CMS: ${config.adminCmsUrl}` : 'Configure ADMIN_CMS_URL.',
        ]),
        adminMenu()
      );
      return;
    }

    await ctx.replyWithMarkdown(welcome, mainMenu());

    // Optional human community links (bot does not post or chat there)
    await ctx.replyWithMarkdown(
      block([
        '*Community (optional)*',
        'News & chat with other users — the bot does not operate there.',
        '',
        `📢 ${channelUrl}`,
        `💬 ${groupUrl}`,
      ]),
      Markup.inlineKeyboard([
        [Markup.button.url('📢 Channel', channelUrl), Markup.button.url('💬 Group', groupUrl)],
      ])
    );
  });

  bot.action('go_home', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = {};
    await ctx.reply('Main menu', mainMenu());
  });
};
