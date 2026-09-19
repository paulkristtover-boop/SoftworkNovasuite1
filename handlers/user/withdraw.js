const { getUser } = require('../../services/userService');
const { getSetting } = require('../../services/settingsService');
const { mainMenu, cancelInline } = require('../../keyboards/user');
const { formatUsd } = require('../../utils/helpers');
const config = require('../../config');
module.exports = function withdrawHandler(bot) {
  bot.hears('📤 Withdraw', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Please /start first.');
    const min = parseFloat(await getSetting('min_withdraw', String(config.minWithdraw)));
    if (parseFloat(user.balance) < min) return ctx.reply(`Min ${formatUsd(min)}. Balance: ${formatUsd(user.balance)}`, mainMenu());
    ctx.session = { step: 'wd_amount' };
    await ctx.reply(`📤 *Withdraw*\nBalance: ${formatUsd(user.balance)}\nMin: ${formatUsd(min)}\n\nEnter amount:`, { parse_mode: 'Markdown', ...cancelInline() });
  });
};
