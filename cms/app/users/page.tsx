import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function banUser(formData: FormData) {
  'use server';
  const id = formData.get('id') as string;
  const reason = (formData.get('reason') as string) || 'Banned by admin';
  await query(`UPDATE users SET is_banned=TRUE, ban_reason=$1, updated_at=NOW() WHERE telegram_id=$2`, [reason, id]);
  await query(`INSERT INTO audit_logs (actor_type, action, target_type, target_id, details) VALUES ('admin','ban_user','user',$1,$2)`, [id, JSON.stringify({ reason })]);
  revalidatePath('/users');
}

async function unbanUser(formData: FormData) {
  'use server';
  const id = formData.get('id') as string;
  await query(`UPDATE users SET is_banned=FALSE, ban_reason=NULL, updated_at=NOW() WHERE telegram_id=$1`, [id]);
  await query(`INSERT INTO audit_logs (actor_type, action, target_type, target_id) VALUES ('admin','unban_user','user',$1)`, [id]);
  revalidatePath('/users');
}

export default async function UsersPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q || '';
  const res = q
    ? await query(
        `SELECT * FROM users WHERE telegram_id::text LIKE $1 OR username ILIKE $1 ORDER BY created_at DESC LIMIT 100`,
        [`%${q}%`]
      )
    : await query(`SELECT * FROM users ORDER BY created_at DESC LIMIT 100`);

  return (
    <AdminShell title="Users">
      <form method="get" style={{ marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="Search ID or username" style={{ maxWidth: 260 }} />
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Username</th><th>Balance</th><th>Earned</th><th>Status</th><th>Joined</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {res.rows.map((u) => (
              <tr key={u.telegram_id}>
                <td className="mono">{u.telegram_id}</td>
                <td>@{u.username || '—'}</td>
                <td>{formatUsd(u.balance)}</td>
                <td>{formatUsd(u.total_earned)}</td>
                <td>
                  {u.is_banned ? <span className="badge badge-banned">Banned</span> : <span className="badge badge-active">Active</span>}
                </td>
                <td>{formatDate(u.created_at)}</td>
                <td>
                  {u.is_banned ? (
                    <form action={unbanUser} className="inline-form">
                      <input type="hidden" name="id" value={u.telegram_id} />
                      <button className="btn btn-sm btn-primary">Unban</button>
                    </form>
                  ) : (
                    <form action={banUser} className="inline-form">
                      <input type="hidden" name="id" value={u.telegram_id} />
                      <input type="hidden" name="reason" value="Banned by admin" />
                      <button className="btn btn-sm btn-danger">Ban</button>
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
