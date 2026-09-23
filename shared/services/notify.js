const { Telegraf } = require('telegraf');
const config = require('../config');
const logger = require('../utils/logger');

let botInstance = null;

function getBot() {
  if (!botInstance && config.botToken) {
    botInstance = new Telegraf(config.botToken);
  }
  return botInstance;
}

/**
 * Notify all admins via the same bot (admin side = notifications only).
 * Management is done in the Web Admin CMS.
 */
async function notifyAdmins(text, extra = {}) {
  const bot = getBot();
  if (!bot) {
    logger.warn('[notify] BOT_TOKEN not set — cannot notify admins');
    return;
  }
  const ids = config.adminIds;
  if (!ids.length) {
    logger.warn('[notify] No ADMIN_IDS configured');
    return;
  }

  let finalText = text;
  if (config.cms.url) {
    finalText += `\n\n<a href="${config.cms.url}">Open Admin CMS →</a>`;
  }

  for (const id of ids) {
    try {
      await bot.telegram.sendMessage(id, finalText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...extra,
      });
    } catch (err) {
      logger.error(`[notify] Failed to notify admin ${id}: ${err.message}`);
    }
  }
}

/**
 * Notify a user via the same bot.
 */
async function notifyUser(telegramId, text, extra = {}) {
  const bot = getBot();
  if (!bot) {
    logger.warn('[notify] BOT_TOKEN not set — cannot notify user');
    return;
  }
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

module.exports = { notifyAdmins, notifyUser, getBot };
