/**
 * Notify users via Telegram Bot API (BOT_TOKEN on Vercel).
 * Failures are logged and never block admin actions.
 */
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
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error('[cms notify]', e.message);
    return { ok: false };
  }
}
