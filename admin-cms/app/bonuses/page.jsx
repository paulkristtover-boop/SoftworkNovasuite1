import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function saveBonusSettings(formData) {
  'use server';
  const amount = String(formData.get('welcome_bonus_amount') || '0').trim();
  const limit = String(formData.get('welcome_bonus_limit') || '30').trim();
  const channel = String(formData.get('channel_url') || '').trim();
  const group = String(formData.get('group_url') || '').trim();

  const pairs = [
    ['welcome_bonus_amount', amount],
    ['welcome_bonus_limit', limit],
    ['channel_url', channel],
    ['group_url', group],
  ];
  for (const [k, v] of pairs) {
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [k, v]
    );
  }
  await query(
    `INSERT INTO audit_logs (actor_type, action, target_type, details)
     VALUES ('admin','update_bonus_settings','settings',$1)`,
    [JSON.stringify({ amount, limit })]
  );
  revalidatePath('/bonuses');
}

export default async function BonusesPage() {
  const settings = await query(
    `SELECT key, value FROM settings WHERE key = ANY($1)`,
    [['welcome_bonus_amount', 'welcome_bonus_limit', 'channel_url', 'group_url', 'welcome_bonus_remaining']]
  );
  const map = {};
  for (const r of settings.rows) map[r.key] = r.value;

  const stats = await query(
    `SELECT
       COUNT(*)::int AS total_granted,
       COALESCE(SUM(amount),0) AS total_paid
     FROM transactions WHERE type = 'welcome_bonus'`
  );
  const recent = await query(
    `SELECT t.id, t.user_id, t.amount, t.created_at, u.username
     FROM transactions t
     LEFT JOIN users u ON t.user_id = u.telegram_id
     WHERE t.type = 'welcome_bonus'
     ORDER BY t.created_at DESC
     LIMIT 40`
  );

  const amount = map.welcome_bonus_amount || '0.5';
  const limit = parseInt(map.welcome_bonus_limit || '30', 10);
  const granted = stats.rows[0].total_granted;
  const remaining = Math.max(0, limit - granted);

  return (
    <AdminShell title="Bonuses">
      <div className="page-header">
        <h2>Welcome starter credit</h2>
        <p>
          First N members (direct or referred) receive a one-time balance credit after joining the official
          channel and group and verifying in the bot. Credit is for Earn / Promote.
        </p>
      </div>

      <div className="cards">
        <div className="card card-accent-green">
          <div className="label">Per user</div>
          <div className="value">{formatUsd(amount)}</div>
          <div className="card-hint">Welcome amount</div>
        </div>
        <div className="card card-accent-amber">
          <div className="label">Spots left</div>
          <div className="value">{remaining}</div>
          <div className="card-hint">of {limit} total</div>
        </div>
        <div className="card card-accent-sky">
          <div className="label">Granted</div>
          <div className="value">{granted}</div>
          <div className="card-hint">Users credited</div>
        </div>
        <div className="card">
          <div className="label">Total paid out</div>
          <div className="value">{formatUsd(stats.rows[0].total_paid, 2)}</div>
          <div className="card-hint">Welcome bonuses</div>
        </div>
      </div>

      <div className="form-card" style={{ maxWidth: 560 }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Settings</h3>
        <form action={saveBonusSettings}>
          <div className="form-group">
            <label>Welcome amount (USDT)</label>
            <input name="welcome_bonus_amount" type="number" step="0.0001" defaultValue={amount} required />
          </div>
          <div className="form-group">
            <label>Limit (first N users)</label>
            <input name="welcome_bonus_limit" type="number" min="0" defaultValue={limit} required />
          </div>
          <div className="form-group">
            <label>Channel URL</label>
            <input name="channel_url" defaultValue={map.channel_url || 'https://t.me/SoftworkNovaSuite'} style={{ maxWidth: '100%' }} />
          </div>
          <div className="form-group">
            <label>Group URL</label>
            <input name="group_url" defaultValue={map.group_url || 'https://t.me/softworknovasuitecommunity'} style={{ maxWidth: '100%' }} />
          </div>
          <button type="submit" className="btn btn-primary">Save bonus settings</button>
        </form>
        <p className="muted" style={{ marginTop: 12 }}>
          Membership check uses CHANNEL_USERNAME / GROUP_USERNAME on the bot host. Users must verify in the bot before credit.
        </p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Recent welcome bonuses</h3>
        </div>
        <div className="table-wrap" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: 'center' }}>
                    No welcome bonuses granted yet
                  </td>
                </tr>
              )}
              {recent.rows.map((r) => (
                <tr key={r.id}>
                  <td>#{r.id}</td>
                  <td className="mono">
                    {r.user_id} @{r.username || '—'}
                  </td>
                  <td>{formatUsd(r.amount)}</td>
                  <td className="muted">{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
