import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';
import { notifyUser } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

async function replyTicket(formData) {
  'use server';
  const id = formData.get('id');
  const reply = String(formData.get('reply') || '').trim();
  if (!reply || reply.length < 2) {
    throw new Error('Reply cannot be empty');
  }

  const res = await query(
    `UPDATE support_tickets
     SET admin_reply = $1, status = 'answered', updated_at = NOW()
     WHERE id = $2
     RETURNING user_id, message, admin_reply`,
    [reply, id]
  );
  const row = res.rows[0];
  if (!row) throw new Error('Ticket not found');

  await query(
    `INSERT INTO audit_logs (actor_type, action, target_type, target_id, details)
     VALUES ('admin','support_reply','support_ticket',$1,$2)`,
    [String(id), JSON.stringify({ preview: reply.slice(0, 120) })]
  );

  await notifyUser(
    row.user_id,
    [
      '💬 *Support reply*',
      '',
      `Ticket *#${id}*`,
      '',
      '*Your message:*',
      row.message.slice(0, 300) + (row.message.length > 300 ? '…' : ''),
      '',
      '*Our reply:*',
      reply.slice(0, 3500),
      '',
      '_Reply in the bot via Support if you need more help._',
    ].join('\n')
  );

  revalidatePath('/support');
}

async function closeTicket(formData) {
  'use server';
  const id = formData.get('id');
  const row = (
    await query(
      `UPDATE support_tickets SET status='closed', updated_at=NOW() WHERE id=$1 RETURNING user_id`,
      [id]
    )
  ).rows[0];

  await query(
    `INSERT INTO audit_logs (actor_type, action, target_type, target_id)
     VALUES ('admin','support_close','support_ticket',$1)`,
    [String(id)]
  );

  if (row) {
    await notifyUser(
      row.user_id,
      `💬 *Ticket #${id} closed*\n\nThis support request is marked resolved. Open Support again if you need help.`
    );
  }
  revalidatePath('/support');
}

async function reopenTicket(formData) {
  'use server';
  await query(
    `UPDATE support_tickets SET status='open', updated_at=NOW() WHERE id=$1`,
    [formData.get('id')]
  );
  revalidatePath('/support');
}

export default async function SupportPage({ searchParams }) {
  const status = searchParams?.status || 'open';
  const res = await query(
    `SELECT t.*, u.username, u.first_name
     FROM support_tickets t
     LEFT JOIN users u ON t.user_id = u.telegram_id
     WHERE ($1 = 'all' OR t.status = $1)
     ORDER BY
       CASE t.status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END,
       t.updated_at DESC
     LIMIT 60`,
    [status]
  );

  const counts = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status='open')::int AS open,
       COUNT(*) FILTER (WHERE status='answered')::int AS answered,
       COUNT(*) FILTER (WHERE status='closed')::int AS closed
     FROM support_tickets`
  );
  const c = counts.rows[0] || { open: 0, answered: 0, closed: 0 };

  return (
    <AdminShell title="Support">
      <div className="page-header">
        <h2>Support tickets</h2>
        <p>
          Reply to users in-app. They receive your message on Telegram instantly (requires BOT_TOKEN on Vercel).
        </p>
      </div>

      <div className="filters">
        <a href="?status=open" className={status === 'open' ? 'active' : ''}>
          Open ({c.open})
        </a>
        <a href="?status=answered" className={status === 'answered' ? 'active' : ''}>
          Answered ({c.answered})
        </a>
        <a href="?status=closed" className={status === 'closed' ? 'active' : ''}>
          Closed ({c.closed})
        </a>
        <a href="?status=all" className={status === 'all' ? 'active' : ''}>
          All
        </a>
      </div>

      {res.rows.length === 0 && (
        <div className="panel">
          <div className="empty-state">No tickets for this filter.</div>
        </div>
      )}

      {res.rows.map((t) => (
        <div key={t.id} className="form-card" style={{ maxWidth: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong>
                #{t.id}{' '}
                <span className={`badge badge-${t.status === 'open' ? 'pending' : t.status === 'answered' ? 'active' : 'closed'}`}>
                  {t.status}
                </span>
              </strong>
              <div className="qi-meta mono" style={{ marginTop: 4 }}>
                {t.user_id} @{t.username || '—'}
                {t.first_name ? ` · ${t.first_name}` : ''}
                {' · '}
                {formatDate(t.created_at)}
                {t.updated_at && t.updated_at !== t.created_at ? ` · updated ${formatDate(t.updated_at)}` : ''}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              padding: '12px 14px',
              background: 'var(--bg)',
              borderRadius: 8,
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="label" style={{ marginBottom: 6 }}>User message</div>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{t.message}</p>
          </div>

          {t.admin_reply && (
            <div
              style={{
                marginTop: 10,
                padding: '12px 14px',
                background: 'var(--accent-dim)',
                borderRadius: 8,
                border: '1px solid rgba(16, 185, 129, 0.25)',
              }}
            >
              <div className="label" style={{ marginBottom: 6, color: 'var(--accent-hover)' }}>
                Admin reply
              </div>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{t.admin_reply}</p>
            </div>
          )}

          {(t.status === 'open' || t.status === 'answered') && (
            <form action={replyTicket} style={{ marginTop: 14 }}>
              <input type="hidden" name="id" value={t.id} />
              <div className="form-group">
                <label>{t.admin_reply ? 'Update reply (re-sends to user)' : 'Your reply'}</label>
                <textarea
                  name="reply"
                  rows={4}
                  required
                  placeholder="Write a clear response to the user…"
                  defaultValue={t.admin_reply || ''}
                  style={{ maxWidth: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary">
                  {t.admin_reply ? 'Update & notify user' : 'Send reply'}
                </button>
              </div>
            </form>
          )}

          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {t.status !== 'closed' && (
              <form action={closeTicket}>
                <input type="hidden" name="id" value={t.id} />
                <button type="submit" className="btn btn-ghost btn-sm">
                  Close ticket
                </button>
              </form>
            )}
            {t.status === 'closed' && (
              <form action={reopenTicket}>
                <input type="hidden" name="id" value={t.id} />
                <button type="submit" className="btn btn-ghost btn-sm">
                  Reopen
                </button>
              </form>
            )}
          </div>
        </div>
      ))}
    </AdminShell>
  );
}
