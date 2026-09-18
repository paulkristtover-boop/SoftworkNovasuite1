import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const res = await query(
    `SELECT t.*, u.username FROM support_tickets t LEFT JOIN users u ON t.user_id=u.telegram_id
     ORDER BY t.created_at DESC LIMIT 100`
  );

  return (
    <AdminShell title="Support Tickets">
      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>User</th><th>Message</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {res.rows.map((t) => (
              <tr key={t.id}>
                <td>#{t.id}</td>
                <td>{t.user_id} @{t.username || '—'}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 400 }}>{t.message}</td>
                <td><span className={`badge badge-${t.status}`}>{t.status}</span></td>
                <td>{formatDate(t.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
