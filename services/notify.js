const config = require('../config');
const logger = require('../utils/logger');

/**
 * Notify all admins via Telegram.
 * bot instance is passed from handlers.
 */
async function notifyAdmins(bot, text, extra = {}) {
  const ids = config.adminIds;
  if (!ids.length) {
    logger.warn('[notify] No ADMIN_IDS configured');
    return;
  }
  for (const id of ids) {
    try {
      await bot.telegram.sendMessage(id, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...extra,
      });
    } catch (err) {
      logger.error(`[notify] Failed to notify admin ${id}: ${err.message}`);
    }
  }
}

async function notifyUser(bot, telegramId, text, extra = {}) {
  try {
    await bot.telegram.sendMessage(telegramId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra,
    });
  } catch (err) {
    logger.error(`[notify] Failed to notify user ${telegramId}: ${err.message}`);
  }
}

module.exports = { notifyAdmins, notifyUser };
