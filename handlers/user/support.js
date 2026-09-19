const { getSetting } = require('../../services/settingsService');
const { pool } = require('../../database');
const { cancelInline, mainMenu } = require('../../keyboards/user');
const { block, SEP, tip } = require('../../utils/ui');
const { Markup } = require('telegraf');
const config = require('../../config');

module.exports = function supportHandler(bot) {
  bot.hears('💬 Support', async (ctx) => {
    const u = (await getSetting('support_username', '')) || config.supportUsername || '';
    const lines = [
      '💬 *Support*',
      SEP,
      'Describe your issue clearly (include deposit/withdrawal IDs if relevant).',
      '',
    ];
    if (u) lines.push(`Direct contact: @${u.replace('@', '')}`);
    if (config.supportEmail) lines.push(`Email: ${config.supportEmail}`);
    lines.push('', tip('We reply here in chat when your ticket is answered'));

    ctx.session = { step: 'support_msg' };
    await ctx.replyWithMarkdown(
      block(lines),
      Markup.inlineKeyboard([
        [Markup.button.callback('📬 My tickets', 'support_my_tickets')],
        [Markup.button.callback('« Cancel', 'cancel')],
      ])
    );
  });

  bot.action('support_my_tickets', async (ctx) => {
    await ctx.answerCbQuery();
    const res = await pool.query(
      `SELECT id, message, admin_reply, status, created_at, updated_at
       FROM support_tickets
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 8`,
      [ctx.from.id]
    );

    if (!res.rows.length) {
      return ctx.replyWithMarkdown(
        block(['📬 *Your tickets*', SEP, '_No tickets yet._', '', tip('Send a message after tapping Support')]),
        mainMenu()
      );
    }

    for (const t of res.rows) {
      const parts = [
        `🎫 *Ticket #${t.id}* · \`${t.status}\``,
        SEP,
        '*You:*',
        t.message.slice(0, 400) + (t.message.length > 400 ? '…' : ''),
      ];
      if (t.admin_reply) {
        parts.push('', '*Support:*', t.admin_reply.slice(0, 800) + (t.admin_reply.length > 800 ? '…' : ''));
      } else {
        parts.push('', '_Awaiting reply…_');
      }
      await ctx.replyWithMarkdown(block(parts));
    }
    await ctx.reply('Main menu', mainMenu());
  });
};
