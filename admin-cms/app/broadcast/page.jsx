import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { broadcastMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

async function sendBroadcast(formData) {
  'use server';
  const text = String(formData.get('message') || '').trim();
  const audience = formData.get('audience') || 'all';
  if (text.length < 3) throw new Error('Message too short');
  if (text.length > 3500) throw new Error('Message too long (max ~3500)');

  let sql = `SELECT telegram_id FROM users WHERE COALESCE(is_banned, FALSE) = FALSE`;
  if (audience === 'active_balance') {
    sql += ` AND balance > 0`;
  } else if (audience === 'no_welcome') {
    sql += ` AND NOT EXISTS (
      SELECT 1 FROM transactions t WHERE t.user_id = users.telegram_id AND t.type = 'welcome_bonus'
    )`;
  }
  sql += ` ORDER BY created_at ASC LIMIT 5000`;

  const users = await query(sql);
  const ids = users.rows.map((r) => r.telegram_id);

  const result = await broadcastMessage(ids, text, { delayMs: 45 });

  await query(
    `INSERT INTO audit_logs (actor_type, action, target_type, details)
     VALUES ('admin','broadcast','users',$1)`,
    [JSON.stringify({ audience, ...result, preview: text.slice(0, 120) })]
  );

  revalidatePath('/broadcast');
  // Store last result in settings for UI feedback
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('last_broadcast_result',$1,NOW())
     ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
    [JSON.stringify({ ...result, at: new Date().toISOString(), audience })]
  );
}

export default async function BroadcastPage() {
  const counts = await query(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(is_banned,FALSE)=FALSE)::int AS all_users,
       COUNT(*) FILTER (WHERE COALESCE(is_banned,FALSE)=FALSE AND balance > 0)::int AS with_balance,
       COUNT(*) FILTER (
         WHERE COALESCE(is_banned,FALSE)=FALSE
         AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = users.telegram_id AND t.type='welcome_bonus')
       )::int AS no_welcome
     FROM users`
  );
  const c = counts.rows[0];
  const last = await query(`SELECT value FROM settings WHERE key='last_broadcast_result'`);
  let lastResult = null;
  try {
    lastResult = last.rows[0]?.value ? JSON.parse(last.rows[0].value) : null;
  } catch (_) {}

  return (
    <AdminShell title="Broadcast">
      <div className="page-header">
        <h2>Broadcast message</h2>
        <p>
          Send a private Telegram message to users. Messages go to DMs only — the bot does not post in the
          channel or group. Use Markdown sparingly (*bold*, _italic_).
        </p>
      </div>

      <div className="cards">
        <div className="card card-accent-sky">
          <div className="label">All users</div>
          <div className="value">{c.all_users}</div>
        </div>
        <div className="card card-accent-green">
          <div className="label">With balance</div>
          <div className="value">{c.with_balance}</div>
        </div>
        <div className="card card-accent-amber">
          <div className="label">No welcome yet</div>
          <div className="value">{c.no_welcome}</div>
        </div>
      </div>

      {lastResult && (
        <div className="panel" style={{ marginBottom: '1.25rem' }}>
          <div className="panel-header">
            <h3>Last broadcast</h3>
            <span className="badge badge-active">Done</span>
          </div>
          <div className="panel-body" style={{ padding: '0.85rem 1.15rem' }}>
            <p className="muted" style={{ margin: 0 }}>
              Sent {lastResult.sent} · Failed {lastResult.failed} · Audience: {lastResult.audience} ·{' '}
              {lastResult.at ? new Date(lastResult.at).toLocaleString() : ''}
            </p>
          </div>
        </div>
      )}

      <div className="form-card" style={{ maxWidth: 640 }}>
        <form action={sendBroadcast}>
          <div className="form-group">
            <label>Audience</label>
            <select name="audience" defaultValue="all">
              <option value="all">All non-banned users ({c.all_users})</option>
              <option value="active_balance">Balance &gt; 0 ({c.with_balance})</option>
              <option value="no_welcome">Not yet welcome-credited ({c.no_welcome})</option>
            </select>
          </div>
          <div className="form-group">
            <label>Message</label>
            <textarea
              name="message"
              rows={8}
              required
              placeholder={'Example:\n\n🎁 *Update*\n\nJoin channel & group, then /start → Verify membership to claim your welcome credit.'}
              style={{ maxWidth: '100%' }}
            />
          </div>
          <p className="muted" style={{ marginBottom: 12 }}>
            Rate-limited (~20 msg/sec max recommended). Large lists may take a few minutes.
          </p>
          <button type="submit" className="btn btn-primary">
            Send broadcast
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Suggested templates</h3>
        </div>
        <div className="panel-body" style={{ padding: '1rem 1.15rem' }}>
          <p className="mono muted" style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>
{`🎁 *Welcome credit reminder*

Join our community, then open the bot:
1. Channel + group
2. /start → Verify membership

Spots are limited for the starter credit.`}
          </p>
          <p className="mono muted" style={{ whiteSpace: 'pre-wrap' }}>
{`📢 *NovaSuite update*

New features are live. Open the bot anytime in *private chat* for Earn, Promote, and Wallet.

Community links stay for news — the bot does not message inside the group.`}
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
