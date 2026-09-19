import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';
import { notifyUser } from '@/lib/telegram';
export const dynamic = 'force-dynamic';

async function banUser(formData) {
  'use server';
  const id = formData.get('id');
  const reason = formData.get('reason') || 'Banned by admin';
  await query('UPDATE users SET is_banned=TRUE, ban_reason=$1, updated_at=NOW() WHERE telegram_id=$2', [reason, id]);
  await query("INSERT INTO audit_logs (actor_type,action,target_type,target_id,details) VALUES ('admin','ban_user','user',$1,$2)", [String(id), JSON.stringify({ reason })]);
  await notifyUser(id, `🚫 *Account restricted*\n\nReason: ${reason}\n\nContact support if this is a mistake.`);
  revalidatePath('/users');
}
async function unbanUser(formData) {
  'use server';
  const id = formData.get('id');
  await query('UPDATE users SET is_banned=FALSE, ban_reason=NULL, updated_at=NOW() WHERE telegram_id=$1', [id]);
  await query("INSERT INTO audit_logs (actor_type,action,target_type,target_id) VALUES ('admin','unban_user','user',$1)", [String(id)]);
  await notifyUser(id, `✅ *Account restored*\n\nYou can use NovaSuite again.`);
  revalidatePath('/users');
}

export default async function Page({ searchParams }) {
  const q = searchParams?.q || '';
  const res = q
    ? await query("SELECT * FROM users WHERE telegram_id::text LIKE $1 OR username ILIKE $1 ORDER BY created_at DESC LIMIT 80", ['%' + q + '%'])
    : await query('SELECT * FROM users ORDER BY created_at DESC LIMIT 80');
  return (
    <AdminShell title="Users">
      <form method="get" style={{ marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="Telegram ID or username" style={{ maxWidth: 280 }} />
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>User</th><th>Balance</th><th>Earned</th><th>Fraud</th><th>Status</th><th>Joined</th><th></th></tr>
          </thead>
          <tbody>
            {res.rows.map((u) => (
              <tr key={u.telegram_id}>
                <td className="mono">{u.telegram_id}</td>
                <td>@{u.username || '—'}<br/><span className="muted">{u.first_name || ''}</span></td>
                <td>{formatUsd(u.balance)}</td>
                <td>{formatUsd(u.total_earned, 2)}</td>
                <td>{u.fraud_score || 0}</td>
                <td>{u.is_banned ? <span className="badge badge-banned">Banned</span> : <span className="badge badge-active">Active</span>}</td>
                <td>{formatDate(u.created_at)}</td>
                <td>
                  {u.is_banned ? (
                    <form action={unbanUser} className="inline-form">
                      <input type="hidden" name="id" value={u.telegram_id} />
                      <button type="submit" className="btn btn-sm btn-primary">Unban</button>
                    </form>
                  ) : (
                    <form action={banUser} className="inline-form">
                      <input type="hidden" name="id" value={u.telegram_id} />
                      <input type="hidden" name="reason" value="Banned by admin" />
                      <button type="submit" className="btn btn-sm btn-danger">Ban</button>
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
