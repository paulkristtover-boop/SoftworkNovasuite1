import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';
import { notifyUser, broadcastMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

async function setAdStatus(formData) {
  'use server';
  const id = formData.get('id');
  const status = formData.get('status');
  const note = formData.get('note') || null;

  if (status === 'active') {
    const checklist = {
      link_works: formData.get('link_works') === 'on',
      content_ok: formData.get('content_ok') === 'on',
      reward_fair: formData.get('reward_fair') === 'on',
      not_scam: formData.get('not_scam') === 'on',
    };
    if (!Object.values(checklist).every(Boolean)) {
      throw new Error('Complete all review checks before activating this campaign');
    }
    await query(
      `UPDATE ads SET status='active', admin_note=$1, updated_at=NOW() WHERE id=$2 AND status='pending'`,
      [note || JSON.stringify(checklist), id]
    );
    await query(
      `INSERT INTO audit_logs (actor_type, action, target_type, target_id, details)
       VALUES ('admin','activate_ad','ad',$1,$2)`,
      [String(id), JSON.stringify(checklist)]
    );
    {
      const row = await query('SELECT owner_id, title, reward, type FROM ads WHERE id=$1', [id]);
      const r = row.rows[0];
      if (r) {
        await notifyUser(
          r.owner_id,
          `✅ *Campaign activated*\n\n#${id} · ${r.title}\n\nYour ad is now live for users to view.`
        );
        // Notify earners (non-banned, not the owner) — capped
        const users = await query(
          `SELECT telegram_id FROM users
           WHERE COALESCE(is_banned,FALSE)=FALSE AND telegram_id <> $1
           ORDER BY last_active_at DESC NULLS LAST
           LIMIT 400`,
          [r.owner_id]
        );
        const msg = [
          '⚡ *New campaign live*',
          '',
          `*${r.title}*`,
          `Reward: $${parseFloat(r.reward).toFixed(4)} USDT`,
          r.type ? `Type: ${r.type}` : '',
          '',
          'Open the bot → *Earn* to view and get paid.',
        ].filter(Boolean).join('\n');
        const ids = users.rows.map((u) => u.telegram_id);
        await broadcastMessage(ids, msg, { delayMs: 35 });
      }
    }
  } else if (status === 'rejected') {
    await query(
      `UPDATE ads SET status='rejected', admin_note=$1, updated_at=NOW() WHERE id=$2`,
      [note || 'Rejected in CMS review', id]
    );
    await query(
      `INSERT INTO audit_logs (actor_type, action, target_type, target_id, details)
       VALUES ('admin','reject_ad','ad',$1,$2)`,
      [String(id), JSON.stringify({ note })]
    );
    {
      const row = await query('SELECT owner_id, title FROM ads WHERE id=$1', [id]);
      const r = row.rows[0];
      if (r) {
        await notifyUser(
          r.owner_id,
          `❌ *Campaign rejected*\n\n#${id} · ${r.title}\n\nContact support if you need details.`
        );
      }
    }
  } else {
    await query(`UPDATE ads SET status=$1, updated_at=NOW() WHERE id=$2`, [status, id]);
    await query(
      `INSERT INTO audit_logs (actor_type, action, target_type, target_id, details)
       VALUES ('admin','set_ad_status','ad',$1,$2)`,
      [String(id), JSON.stringify({ status })]
    );
  }
  revalidatePath('/ads');
}

export default async function AdsPage({ searchParams }) {
  const status = searchParams?.status || 'pending';
  const res = await query(
    `SELECT a.*, u.username, u.first_name, u.balance AS owner_balance
     FROM ads a
     LEFT JOIN users u ON a.owner_id = u.telegram_id
     WHERE ($1 = 'all' OR a.status = $1)
     ORDER BY
       CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END,
       a.created_at DESC
     LIMIT 60`,
    [status]
  );

  const pendingCount = (
    await query(`SELECT COUNT(*)::int AS c FROM ads WHERE status='pending'`)
  ).rows[0].c;

  return (
    <AdminShell title="Campaigns">
      <div className="page-header">
        <h2>Campaign review</h2>
        <p>
          Decide what users will see when they tap Earn. Open each link, check the offer is legitimate, then activate.
          {pendingCount > 0 ? ` ${pendingCount} waiting for review.` : ''}
        </p>
      </div>

      <div className="filters">
        {['pending', 'active', 'paused', 'rejected', 'finished', 'all'].map((s) => (
          <a key={s} href={`?status=${s}`} className={status === s ? 'active' : ''}>
            {s}
            {s === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </a>
        ))}
      </div>

      {res.rows.length === 0 && (
        <div className="panel">
          <div className="empty-state">No campaigns for this filter.</div>
        </div>
      )}

      {res.rows.map((a) => {
        const estViews =
          parseFloat(a.reward) > 0
            ? Math.floor(parseFloat(a.budget) / parseFloat(a.reward))
            : 0;
        return (
          <div key={a.id} className="form-card" style={{ maxWidth: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '1.05rem' }}>#{a.id} · {a.title}</strong>
                  <span className={`badge badge-${a.status}`}>{a.status}</span>
                  <span className="pill">{a.type || 'campaign'}</span>
                </div>
                <div className="qi-meta" style={{ marginTop: 6 }}>
                  Owner <span className="mono">{a.owner_id}</span>
                  {a.username ? ` @${a.username}` : ''}
                  {a.first_name ? ` · ${a.first_name}` : ''}
                  {' · '}
                  Balance {formatUsd(a.owner_balance || 0)}
                  {' · '}
                  {formatDate(a.created_at)}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                padding: '12px 14px',
                background: 'var(--bg)',
                borderRadius: 8,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="label" style={{ marginBottom: 6 }}>Destination URL (open & verify)</div>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent-hover)', wordBreak: 'break-all', fontWeight: 600 }}
              >
                {a.url}
              </a>
              {a.description ? (
                <p className="muted" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>
                  {a.description}
                </p>
              ) : null}
            </div>

            <div className="cards" style={{ marginTop: 14, marginBottom: 0 }}>
              <div className="card card-accent-green">
                <div className="label">Reward / view</div>
                <div className="value" style={{ fontSize: '1.15rem' }}>{formatUsd(a.reward)}</div>
              </div>
              <div className="card">
                <div className="label">Budget / spent</div>
                <div className="value" style={{ fontSize: '1.15rem' }}>
                  {formatUsd(a.budget, 2)}
                  <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                    {' '}/ {formatUsd(a.spent, 2)}
                  </span>
                </div>
              </div>
              <div className="card">
                <div className="label">Est. views</div>
                <div className="value" style={{ fontSize: '1.15rem' }}>~{estViews}</div>
                <div className="card-hint">{a.views_done || 0} completed</div>
              </div>
              <div className="card">
                <div className="label">View duration</div>
                <div className="value" style={{ fontSize: '1.15rem' }}>{a.duration_sec || 15}s</div>
              </div>
            </div>

            {a.status === 'pending' && (
              <form action={setAdStatus} style={{ marginTop: 16 }}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="status" value="active" />
                <div className="label" style={{ marginBottom: 4 }}>Review checklist</div>
                <div className="checklist">
                  <label>
                    <input type="checkbox" name="link_works" /> Link opens and loads correctly
                  </label>
                  <label>
                    <input type="checkbox" name="content_ok" /> Content is appropriate (no illegal / adult spam)
                  </label>
                  <label>
                    <input type="checkbox" name="reward_fair" /> Reward and budget look reasonable
                  </label>
                  <label>
                    <input type="checkbox" name="not_scam" /> Not phishing, malware, or misleading
                  </label>
                </div>
                <div className="form-group">
                  <label>Optional note</label>
                  <input name="note" placeholder="Internal note (optional)" style={{ maxWidth: '100%' }} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="submit" className="btn btn-primary">
                    Activate campaign
                  </button>
                </div>
              </form>
            )}

            {a.status === 'pending' && (
              <form action={setAdStatus} style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="status" value="rejected" />
                <input type="hidden" name="note" value="Rejected in CMS review" />
                <button type="submit" className="btn btn-danger btn-sm">
                  Reject campaign
                </button>
              </form>
            )}

            {a.status === 'active' && (
              <form action={setAdStatus} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="status" value="paused" />
                <button type="submit" className="btn btn-ghost btn-sm">
                  Pause campaign
                </button>
              </form>
            )}

            {a.status === 'paused' && (
              <form action={setAdStatus} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="status" value="active" />
                <button type="submit" className="btn btn-primary btn-sm">
                  Resume
                </button>
              </form>
            )}

            {a.admin_note && a.status !== 'pending' && (
              <p className="muted" style={{ marginTop: 10 }}>
                Note: {a.admin_note}
              </p>
            )}
          </div>
        );
      })}
    </AdminShell>
  );
}
