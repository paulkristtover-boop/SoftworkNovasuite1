import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatDate } from '@/lib/format';
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [events, risky] = await Promise.all([
    query('SELECT * FROM fraud_events ORDER BY created_at DESC LIMIT 80'),
    query('SELECT telegram_id, username, fraud_score, is_banned FROM users WHERE fraud_score > 0 ORDER BY fraud_score DESC LIMIT 40'),
  ]);
  return (
    <AdminShell title="Anti-fraud">
      <h3 style={{ marginBottom: 8, fontSize: '0.95rem' }}>Users with fraud score</h3>
      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table>
          <thead><tr><th>User</th><th>Score</th><th>Banned</th></tr></thead>
          <tbody>
            {risky.rows.map((u) => (
              <tr key={u.telegram_id}>
                <td className="mono">{u.telegram_id} @{u.username || '—'}</td>
                <td>{u.fraud_score}</td>
                <td>{u.is_banned ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 style={{ marginBottom: 8, fontSize: '0.95rem' }}>Recent events</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>User</th><th>Event</th><th>Severity</th><th>Details</th><th>Date</th></tr></thead>
          <tbody>
            {events.rows.map((e) => (
              <tr key={e.id}>
                <td className="mono">{e.user_id || '—'}</td>
                <td>{e.event_type}</td>
                <td>{e.severity}</td>
                <td className="mono muted">{e.details ? JSON.stringify(e.details).slice(0, 60) : '—'}</td>
                <td>{formatDate(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
