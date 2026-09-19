const { findOrCreateUser, getUser } = require('../../services/userService');
const { getSetting } = require('../../services/settingsService');
const { maybeGrantWelcomeBonus, welcomeBonusStatus } = require('../../services/welcomeBonus');
const { checkCommunityMembership, communityLinks } = require('../../services/membershipService');
const { mainMenu } = require('../../keyboards/user');
const { adminMenu } = require('../../keyboards/admin');
const { isAdmin, formatUsd } = require('../../utils/helpers');
const { block, SEP, brandName, tip, success } = require('../../utils/ui');
const { Markup } = require('telegraf');
const config = require('../../config');

function joinKeyboard() {
  const { channelUrl, groupUrl } = communityLinks();
  return Markup.inlineKeyboard([
    [Markup.button.url('📢 Join channel', channelUrl)],
    [Markup.button.url('💬 Join group', groupUrl)],
    [Markup.button.callback('✅ Verify membership', 'verify_join')],
  ]);
}

module.exports = function startHandler(bot) {
  bot.start(async (ctx) => {
    const { user, isNew } = await findOrCreateUser(ctx.from, ctx.startPayload || null);
    const name = ctx.from.first_name || 'there';
    const custom = await getSetting('welcome_message', '');
    const { channelUrl, groupUrl } = communityLinks();
    const bonusStatus = await welcomeBonusStatus();

    const membership = await checkCommunityMembership(ctx.telegram, ctx.from.id);

    let bonusLine = null;
    if (membership.ok) {
      // Grant welcome bonus only after verified join (first 30, direct or referred)
      const bonus = await maybeGrantWelcomeBonus(user.telegram_id);
      if (bonus.granted) {
        bonusLine = `🎁 *Welcome bonus credited:* +${formatUsd(bonus.amount)}\n_First ${bonus.limit} members · ${bonus.remaining} spots left_`;
      } else if (bonus.reason === 'sold_out' && isNew) {
        bonusLine = '_Welcome bonus pool is full (first 30 claimed)._';
      } else if (bonus.reason === 'already') {
        bonusLine = null;
      }
    } else if (bonusStatus.remaining > 0) {
      bonusLine = `🎁 *Welcome bonus* ${formatUsd(bonusStatus.amount)} for the *first ${bonusStatus.limit}* members\n_Spots left: ${bonusStatus.remaining} — join community & verify to claim_`;
    }

    const fresh = await getUser(user.telegram_id);
    const bal = fresh?.balance ?? user.balance;

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
      bonusLine ? '' : null,
      bonusLine,
      '',
      '*Official community*',
      `📢 ${channelUrl}`,
      `💬 ${groupUrl}`,
      '',
      membership.ok
        ? '✅ Channel & group membership verified'
        : '⚠️ Join *both* channel and group, then tap *Verify membership*',
      '',
      `_Balance: ${formatUsd(bal)}_`,
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
      return;
    }

    if (membership.ok) {
      await ctx.replyWithMarkdown(welcome, mainMenu());
    } else {
      await ctx.replyWithMarkdown(welcome, joinKeyboard());
    }
  });

  bot.action('verify_join', async (ctx) => {
    await ctx.answerCbQuery('Checking…');
    const result = await checkCommunityMembership(ctx.telegram, ctx.from.id);

    if (!result.ok) {
      const missing = [];
      if (!result.channel.ok) missing.push(`channel (${result.channel.status})`);
      if (!result.group.ok) missing.push(`group (${result.group.status})`);

      await ctx.replyWithMarkdown(
        block([
          '❌ *Not verified yet*',
          SEP,
          `Still missing: *${missing.join(', ')}*`,
          '',
          '1. Open the links and join',
          '2. Return here and tap Verify again',
          '',
          tip('The bot must be able to see members — ensure it is admin in the group/channel'),
        ]),
        joinKeyboard()
      );
      return;
    }

    // Membership OK → grant welcome bonus if eligible (first 30)
    const bonus = await maybeGrantWelcomeBonus(ctx.from.id);
    const user = await getUser(ctx.from.id);

    const lines = [
      success(
        'Membership verified',
        block([
          SEP,
          'You are in the official channel and group.',
          '',
          bonus.granted
            ? `🎁 Welcome bonus: *+${formatUsd(bonus.amount)}* credited\n_First ${bonus.limit} members · ${bonus.remaining} left_`
            : bonus.reason === 'sold_out'
              ? '_Welcome bonus pool is full._'
              : bonus.reason === 'already'
                ? '_Welcome bonus already claimed._'
                : null,
          '',
          `_Balance: ${formatUsd(user?.balance || 0)}_`,
        ])
      ),
    ];

    await ctx.replyWithMarkdown(lines.filter(Boolean).join('\n\n'), mainMenu());
  });

  bot.action('go_home', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = {};
    await ctx.reply('Main menu', mainMenu());
  });
};
