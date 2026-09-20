/**
 * Telegram Bot API helpers for Admin CMS (BOT_TOKEN on Vercel).
 */

const MEMBER_OK = new Set(['creator', 'administrator', 'member', 'restricted']);

export async function notifyUser(telegramId, text, extra = {}) {
  const token = process.env.BOT_TOKEN;
  if (!token || !telegramId) return { ok: false, skipped: true };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...extra,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[cms notify]', res.status, body);
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (e) {
    console.error('[cms notify]', e.message);
    return { ok: false, error: e.message };
  }
}

async function getChatMember(chatId, userId) {
  const token = process.env.BOT_TOKEN;
  if (!token) return { ok: false, status: 'no_token' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, user_id: userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) return { ok: false, status: data.description || 'error' };
    const status = data.result?.status || 'left';
    return { ok: MEMBER_OK.has(status), status };
  } catch (e) {
    return { ok: false, status: e.message };
  }
}

export async function checkMembership(userId) {
  const channel = process.env.CHANNEL_USERNAME || '@SoftworkNovaSuite';
  const group = process.env.GROUP_USERNAME || '@softworknovasuitecommunity';
  const [ch, gr] = await Promise.all([
    getChatMember(channel, userId),
    getChatMember(group, userId),
  ]);
  return { channel: ch, group: gr, ok: ch.ok && gr.ok };
}

/**
 * Send the same message to many users with small delay to respect rate limits.
 */
export async function broadcastMessage(userIds, text, { delayMs = 50 } = {}) {
  let sent = 0;
  let failed = 0;
  for (const id of userIds) {
    const r = await notifyUser(id, text);
    if (r.ok) sent += 1;
    else failed += 1;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { sent, failed, total: userIds.length };
}
