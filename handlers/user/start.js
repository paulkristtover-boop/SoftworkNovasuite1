const { findOrCreateUser, getUser } = require('../../services/userService');
const { getSetting } = require('../../services/settingsService');
const { maybeGrantWelcomeBonus, welcomeBonusStatus, hasWelcomeBonus } = require('../../services/welcomeBonus');
const { checkCommunityMembership, communityLinks } = require('../../services/membershipService');
const { mainMenu, joinKeyboard } = require('../../keyboards/user');
const { adminMenu } = require('../../keyboards/admin');
const { isAdmin, formatUsd } = require('../../utils/helpers');
const { block, SEP, brandName, tip, success } = require('../../utils/ui');
const { pool } = require('../../database');
const config = require('../../config');

module.exports = function startHandler(bot) {
  bot.start(async (ctx) => {
    if (ctx.chat?.type && ctx.chat.type !== 'private') return;

    const { user, isNew } = await findOrCreateUser(ctx.from, ctx.startPayload || null);
    const name = ctx.from.first_name || 'there';
    const custom = await getSetting('welcome_message', '');
    const { channelUrl, groupUrl } = communityLinks();
    const status = await welcomeBonusStatus();

    // Welcome bonus on join (first N) — not gated on membership
    let bonusLine = null;
    let justGranted = false;
    const bonus = await maybeGrantWelcomeBonus(user.telegram_id, {
      notifyAdmins: true,
      telegram: ctx.telegram,
    });
    if (bonus.granted) {
      justGranted = true;
      bonusLine = [
        `🎁 *Welcome bonus:* +${formatUsd(bonus.amount)}`,
        `_Automatic credit · first ${bonus.limit} members · ${bonus.remaining} left_`,
        `_Use for Earn or Promote_`,
      ].join('\n');
    } else if (bonus.reason === 'already') {
      bonusLine = `✅ Welcome bonus already in your wallet (${formatUsd(bonus.amount || status.amount)})`;
    } else if (bonus.reason === 'sold_out' && isNew) {
      bonusLine = '_Welcome bonus pool is full._';
    }

    let membership = { ok: true, channel: { ok: true }, group: { ok: true } };
    if (config.requireMembership) {
      membership = await checkCommunityMembership(ctx.telegram, ctx.from.id);
      if (membership.ok) {
        await pool
          .query(`UPDATE users SET membership_verified=TRUE WHERE telegram_id=$1`, [user.telegram_id])
          .catch(() => {});
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
          '• *Promote* — advertise & manage campaigns',
          '• *Refer* — invite friends and earn a share',
          '• *Wallet* — deposit & withdraw',
        ].join('\n'),
      bonusLine ? '' : null,
      bonusLine,
      '',
      '*Community*',
      `📢 ${channelUrl}`,
      `💬 ${groupUrl}`,
      '',
      config.requireMembership
        ? membership.ok
          ? '✅ Membership verified'
          : '📢 Please join channel & group (we’ll remind you) · then *Verify*'
        : null,
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
          config.adminCmsUrl ? `CMS: ${config.adminCmsUrl}` : '',
        ]),
        adminMenu()
      );
      return;
    }

    if (!config.requireMembership || membership.ok) {
      await ctx.replyWithMarkdown(welcome, mainMenu());
      if (justGranted) {
        await ctx.replyWithMarkdown(
          success('Welcome bonus added', `+${formatUsd(bonus.amount)} is in your Wallet now.`)
        );
      }
    } else {
      await ctx.replyWithMarkdown(welcome, joinKeyboard());
      if (justGranted) {
        await ctx.replyWithMarkdown(
          success(
            'Welcome bonus added',
            `+${formatUsd(bonus.amount)} is already in your balance.\nJoin the community to unlock Earn & more.`
          )
        );
      }
    }
  });

  bot.action('verify_join', async (ctx) => {
    await ctx.answerCbQuery('Checking…');
    const result = await checkCommunityMembership(ctx.telegram, ctx.from.id);
    if (!result.ok) {
      await ctx.replyWithMarkdown(
        block([
          '❌ *Not fully joined yet*',
          SEP,
          result.channel.ok ? '✅ Channel' : '❌ Channel',
          result.group.ok ? '✅ Group' : '❌ Group',
          '',
          tip('Join both, then Verify again — we also send reminders'),
        ]),
        joinKeyboard()
      );
      return;
    }
    await pool
      .query(`UPDATE users SET membership_verified=TRUE, join_reminded_at=NULL WHERE telegram_id=$1`, [
        ctx.from.id,
      ])
      .catch(() => {});

    // Ensure bonus if they somehow missed it
    const bonus = await maybeGrantWelcomeBonus(ctx.from.id, {
      notifyAdmins: true,
      telegram: ctx.telegram,
    });
    const user = await getUser(ctx.from.id);
    await ctx.replyWithMarkdown(
      success(
        'You’re in',
        block([
          SEP,
          'Full access unlocked.',
          bonus.granted
            ? `🎁 Bonus: +${formatUsd(bonus.amount)}`
            : bonus.reason === 'already'
              ? `✅ Bonus already credited`
              : null,
          `_Balance: ${formatUsd(user?.balance || 0)}_`,
        ])
      ),
      mainMenu()
    );
  });

  bot.action('go_home', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = {};
    if (config.requireMembership && !isAdmin(ctx.from.id)) {
      const result = await checkCommunityMembership(ctx.telegram, ctx.from.id);
      if (!result.ok) {
        return ctx.replyWithMarkdown(
          block(['🔒 Join channel & group to continue', tip('Verify when done')]),
          joinKeyboard()
        );
      }
    }
    await ctx.reply('✅ Main menu', mainMenu());
  });
};
