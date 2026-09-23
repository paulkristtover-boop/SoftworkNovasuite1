const userKb = require('../keyboards/user');
const adminKb = require('../keyboards/admin');
const config = require('../config');
const { money } = require('../utils/format');

async function startHandler(ctx) {
  const user = ctx.state.user;
  const name = user.first_name || user.username || 'there';

  const welcome = `
👋 <b>Welcome, ${name}!</b>

Your secure USDT wallet assistant.

• Currency: <b>${config.app.currency}</b>
• Balance: <b>${money(user.balance)}</b>
• Min deposit: ${config.app.minDeposit} ${config.app.currency}
• Min withdrawal: ${config.app.minWithdrawal} ${config.app.currency}

Use the menu below to deposit, withdraw, or contact support.
All deposits & withdrawals are reviewed by our team for safety.
`.trim();

  if (ctx.state.isAdmin) {
    await ctx.reply(welcome + '\n\n🛡 <i>Admin access detected.</i>', {
      parse_mode: 'HTML',
      ...adminKb.adminMenu(),
    });
  } else {
    await ctx.reply(welcome, {
      parse_mode: 'HTML',
      ...userKb.mainMenu(),
    });
  }

  if (!user.accepted_terms && !ctx.state.isAdmin) {
    await ctx.reply(
      '📄 Please review and accept our Terms of Use to continue using the service.',
      { parse_mode: 'HTML', ...userKb.termsKeyboard() }
    );
  }
}

module.exports = { startHandler };
