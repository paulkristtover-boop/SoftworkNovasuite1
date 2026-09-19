import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatDate } from '@/lib/format';
export const dynamic = 'force-dynamic';

export default async function Page() {
  const res = await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100');
  return (
    <AdminShell title="Audit Logs">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Actor</th><th>Action</th><th>Target</th><th>Details</th><th>Date</th></tr></thead>
          <tbody>
            {res.rows.map((l) => (
              <tr key={l.id}>
                <td>{l.actor_type}{l.actor_id ? ' ' + l.actor_id : ''}</td>
                <td>{l.action}</td>
                <td>{l.target_type} {l.target_id || ''}</td>
                <td className="mono muted">{l.details ? JSON.stringify(l.details).slice(0, 80) : '—'}</td>
                <td>{formatDate(l.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
