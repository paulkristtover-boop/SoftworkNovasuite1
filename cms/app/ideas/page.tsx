import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function IdeasPage() {
  const res = await query(
    `SELECT i.*, u.username FROM ideas i LEFT JOIN users u ON i.user_id=u.telegram_id
     ORDER BY i.created_at DESC LIMIT 100`
  );

  return (
    <AdminShell title="Ideas / Feedback">
      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>User</th><th>Content</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {res.rows.map((i) => (
              <tr key={i.id}>
                <td>#{i.id}</td>
                <td>{i.user_id} @{i.username || '—'}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 400 }}>{i.content}</td>
                <td><span className={`badge badge-${i.status}`}>{i.status}</span></td>
                <td>{formatDate(i.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
