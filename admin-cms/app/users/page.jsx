import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd } from '@/lib/format';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';
async function ban(formData) { 'use server'; await query('UPDATE users SET is_banned=TRUE, ban_reason=$1 WHERE telegram_id=$2', [formData.get('reason')||'Banned', formData.get('id')]); revalidatePath('/users'); }
async function unban(formData) { 'use server'; await query('UPDATE users SET is_banned=FALSE, ban_reason=NULL WHERE telegram_id=$1', [formData.get('id')]); revalidatePath('/users'); }
export default async function Page({ searchParams }) {
  const q = searchParams?.q || '';
  const res = q ? await query("SELECT * FROM users WHERE telegram_id::text LIKE $1 OR username ILIKE $1 ORDER BY created_at DESC LIMIT 50", ['%'+q+'%']) : await query('SELECT * FROM users ORDER BY created_at DESC LIMIT 50');
  return (<AdminShell title="Users"><form method="get" style={{marginBottom:16}}><input name="q" defaultValue={q} placeholder="Search" style={{maxWidth:260}}/></form>
  <div className="table-wrap"><table><thead><tr><th>ID</th><th>User</th><th>Balance</th><th>Fraud</th><th>Status</th><th></th></tr></thead>
  <tbody>{res.rows.map(u=>(<tr key={u.telegram_id}><td className="mono">{u.telegram_id}</td><td>@{u.username||'—'}</td><td>{formatUsd(u.balance)}</td><td>{u.fraud_score||0}</td>
  <td>{u.is_banned?<span className="badge badge-banned">Banned</span>:<span className="badge badge-active">Active</span>}</td>
  <td>{u.is_banned?(<form action={unban} className="inline-form"><input type="hidden" name="id" value={u.telegram_id}/><button className="btn btn-sm btn-primary">Unban</button></form>):(<form action={ban} className="inline-form"><input type="hidden" name="id" value={u.telegram_id}/><input type="hidden" name="reason" value="Banned"/><button className="btn btn-sm btn-danger">Ban</button></form>)}</td>
  </tr>))}</tbody></table></div></AdminShell>);
}
