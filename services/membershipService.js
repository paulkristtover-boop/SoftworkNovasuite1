const config = require('../config');
const { logger } = require('../utils/logger');

const MEMBER_OK = new Set(['creator', 'administrator', 'member', 'restricted']);

/**
 * Check if user is a member of a chat (channel or group).
 * Bot must be an admin in the chat for private groups; public @username works when bot can see members.
 */
async function isMember(telegram, chatId, userId) {
  if (!chatId) return { ok: false, status: 'missing_chat' };
  try {
    const m = await telegram.getChatMember(chatId, userId);
    const status = m?.status || 'left';
    return { ok: MEMBER_OK.has(status), status };
  } catch (e) {
    logger.warn('getChatMember failed', chatId, e.message);
    return { ok: false, status: 'error', error: e.message };
  }
}

async function checkCommunityMembership(telegram, userId) {
  const channel = config.channelUsername || '@SoftworkNovaSuite';
  const group = config.groupUsername || '@softworknovasuitecommunity';

  const [ch, gr] = await Promise.all([
    isMember(telegram, channel, userId),
    isMember(telegram, group, userId),
  ]);

  return {
    channel: ch,
    group: gr,
    ok: ch.ok && gr.ok,
    channelId: channel,
    groupId: group,
  };
}

function communityLinks() {
  return {
    channelUrl: config.channelUrl || 'https://t.me/SoftworkNovaSuite',
    groupUrl: config.groupUrl || 'https://t.me/softworknovasuitecommunity',
  };
}

module.exports = {
  isMember,
  checkCommunityMembership,
  communityLinks,
};
