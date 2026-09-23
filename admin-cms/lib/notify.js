async function tgSend(token, chatId, text) {
  if (!token || !chatId) return;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error('[cms-notify]', e.message);
  }
}

export async function notifyUser(telegramId, text) {
  const token = process.env.BOT_TOKEN || process.env.USER_BOT_TOKEN;
  await tgSend(token, telegramId, text);
}

export async function notifyAdmins(text) {
  const ids = String(process.env.ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const token = process.env.BOT_TOKEN || process.env.USER_BOT_TOKEN;
  for (const id of ids) {
    await tgSend(token, id, text);
  }
}
