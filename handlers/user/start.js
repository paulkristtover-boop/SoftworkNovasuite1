const { findOrCreateUser, getUser } = require('../../services/userService');
const { getSetting } = require('../../services/settingsService');
const { maybeGrantWelcomeBonus, welcomeBonusStatus, hasWelcomeBonus } = require('../../services/welcomeBonus');
const { checkCommunityMembership, communityLinks } = require('../../services/membershipService');
const { joinKeyboard } = require('../../middleware/requireMembership');
const { mainMenu } = require('../../keyboards/user');
const { adminMenu } = require('../../keyboards/admin');
const { isAdmin, formatUsd } = require('../../utils/helpers');
const { block, SEP, brandName, tip, success } = require('../../utils/ui');
const config = require('../../config');

module.exports = function startHandler(bot) {
  bot.start(async (ctx) => {
    if (ctx.chat?.type && ctx.chat.type !== 'private') return;

    const { user, isNew } = await findOrCreateUser(ctx.from, ctx.startPayload || null);
    const name = ctx.from.first_name || 'there';
    const custom = await getSetting('welcome_message', '');
    const { channelUrl, groupUrl } = communityLinks();
    const status = await welcomeBonusStatus();
    const membership = await checkCommunityMembership(ctx.telegram, ctx.from.id);

    let bonusLine = null;
    let justGranted = false;

    if (membership.ok) {
      const bonus = await maybeGrantWelcomeBonus(user.telegram_id, {
        notifyAdmins: true,
        telegram: ctx.telegram,
      });
      if (bonus.granted) {
        justGranted = true;
        bonusLine = [
          `🎁 *Welcome starter credit:* +${formatUsd(bonus.amount)}`,
          `_First ${bonus.limit} members · ${bonus.remaining} left_`,
          `_Use for *Earn* or *Promote*_`,
        ].join('\n');
      } else if (bonus.reason === 'already') {
        bonusLine = `✅ Welcome credit already received (${formatUsd(bonus.amount || status.amount)})`;
      } else if (bonus.reason === 'sold_out') {
        bonusLine = '_Welcome starter pool is full._';
      } else if (bonus.reason && bonus.reason !== 'disabled') {
        bonusLine = `_Bonus note: ${bonus.reason}_`;
      }
    } else if (status.active) {
      bonusLine = [
        `🎁 *Welcome starter credit* ${formatUsd(status.amount)}`,
        `_First ${status.limit} · ${status.remaining} spots left_`,
        `_Join channel & group, then *Verify membership*_`,
      ].join('\n');
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
      '*Community (required)*',
      `📢 ${channelUrl}`,
      `💬 ${groupUrl}`,
      '',
      membership.ok
        ? '✅ Membership verified — you can use the bot'
        : '⚠️ Join *channel* and *group*, then tap *Verify membership*',
      '',
      `_Balance: ${formatUsd(bal)}_`,
      tip('Bot works in private chat only'),
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

    if (membership.ok) {
      await ctx.replyWithMarkdown(welcome, mainMenu());
      if (justGranted) {
        await ctx.replyWithMarkdown(
          success('Bonus credited', `+${formatUsd((await hasWelcomeBonus(user.telegram_id))?.amount || status.amount)} is in your Wallet.`)
        );
      }
    } else {
      await ctx.replyWithMarkdown(welcome, joinKeyboard());
    }
  });

  bot.action('verify_join', async (ctx) => {
    await ctx.answerCbQuery('Checking membership…');
    const result = await checkCommunityMembership(ctx.telegram, ctx.from.id);

    if (!result.ok) {
      const missing = [];
      if (!result.channel.ok) missing.push('channel');
      if (!result.group.ok) missing.push('group');
      await ctx.replyWithMarkdown(
        block([
          '❌ *Not verified yet*',
          SEP,
          result.channel.ok ? '✅ Channel' : '❌ Channel — join first',
          result.group.ok ? '✅ Group' : '❌ Group — join first',
          '',
          `Still missing: *${missing.join(' & ')}*`,
          tip('Bot must be admin in channel & group for checks to work'),
        ]),
        joinKeyboard()
      );
      return;
    }

    const bonus = await maybeGrantWelcomeBonus(ctx.from.id, {
      notifyAdmins: true,
      telegram: ctx.telegram,
    });
    const user = await getUser(ctx.from.id);

    let bonusMsg = null;
    if (bonus.granted) {
      bonusMsg = `🎁 Welcome starter credit: *+${formatUsd(bonus.amount)}*\n_First ${bonus.limit} · ${bonus.remaining} left_`;
    } else if (bonus.reason === 'already') {
      bonusMsg = `✅ Already credited: *${formatUsd(bonus.amount || 0)}*`;
    } else if (bonus.reason === 'sold_out') {
      bonusMsg = '_Welcome pool is full._';
    } else if (bonus.reason === 'disabled') {
      bonusMsg = '_Welcome bonus is currently off._';
    } else {
      bonusMsg = bonus.reason ? `_${bonus.reason}_` : null;
    }

    await ctx.replyWithMarkdown(
      success(
        'Membership verified',
        block([
          SEP,
          'You can use NovaSuite fully now.',
          '',
          bonusMsg,
          '',
          `_Balance: ${formatUsd(user?.balance || 0)}_`,
        ])
      ),
      mainMenu()
    );
  });

  bot.action('go_home', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = {};
    const result = await checkCommunityMembership(ctx.telegram, ctx.from.id);
    if (!result.ok && config.requireMembership && !isAdmin(ctx.from.id)) {
      return ctx.replyWithMarkdown(
        block(['🔒 Join channel & group first', tip('Then verify membership')]),
        joinKeyboard()
      );
    }
    await ctx.reply('✅ Main menu', mainMenu());
  });
};
