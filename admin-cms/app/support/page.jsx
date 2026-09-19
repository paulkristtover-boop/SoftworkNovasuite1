import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';

async function closeTicket(formData) {
  'use server';
  await query("UPDATE support_tickets SET status='closed', updated_at=NOW() WHERE id=$1", [formData.get('id')]);
  revalidatePath('/support');
}

export default async function Page() {
  const res = await query(
    'SELECT t.*, u.username FROM support_tickets t LEFT JOIN users u ON t.user_id=u.telegram_id ORDER BY t.created_at DESC LIMIT 50'
  );
  return (
    <AdminShell title="Support Tickets">
      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>User</th><th>Message</th><th>Status</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {res.rows.map((t) => (
              <tr key={t.id}>
                <td>#{t.id}</td>
                <td>{t.user_id} @{t.username || '—'}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 420 }}>{t.message}</td>
                <td>{t.status}</td>
                <td>{formatDate(t.created_at)}</td>
                <td>
                  {t.status === 'open' && (
                    <form action={closeTicket} className="inline-form">
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="btn btn-sm btn-ghost">Close</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
