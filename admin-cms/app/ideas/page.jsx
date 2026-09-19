import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';

async function setStatus(formData) {
  'use server';
  await query('UPDATE ideas SET status=$1 WHERE id=$2', [formData.get('status'), formData.get('id')]);
  revalidatePath('/ideas');
}

export default async function Page() {
  const res = await query(
    'SELECT i.*, u.username FROM ideas i LEFT JOIN users u ON i.user_id=u.telegram_id ORDER BY i.created_at DESC LIMIT 50'
  );
  return (
    <AdminShell title="Ideas / Feedback">
      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>User</th><th>Content</th><th>Status</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {res.rows.map((i) => (
              <tr key={i.id}>
                <td>#{i.id}</td>
                <td>{i.user_id} @{i.username || '—'}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 420 }}>{i.content}</td>
                <td>{i.status}</td>
                <td>{formatDate(i.created_at)}</td>
                <td>
                  {i.status === 'new' && (
                    <form action={setStatus} className="inline-form">
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="status" value="reviewed" />
                      <button type="submit" className="btn btn-sm btn-ghost">Mark reviewed</button>
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
