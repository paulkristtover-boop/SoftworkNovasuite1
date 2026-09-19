import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd } from '@/lib/format';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';
async function setStatus(formData) { 'use server'; await query('UPDATE ads SET status=$1, updated_at=NOW() WHERE id=$2', [formData.get('status'), formData.get('id')]); revalidatePath('/ads'); }
export default async function Page({ searchParams }) {
  const status = searchParams?.status || 'pending';
  const res = await query("SELECT a.* FROM ads a WHERE ($1='all' OR a.status=$1) ORDER BY a.created_at DESC LIMIT 50", [status]);
  return (<AdminShell title="Ads"><div className="filters">{['pending','active','rejected','finished','all'].map(s=><a key={s} href={'?status='+s} className={status===s?'active':''}>{s}</a>)}</div>
  <div className="table-wrap"><table><thead><tr><th>ID</th><th>Title</th><th>Reward</th><th>Budget</th><th>Views</th><th>Status</th><th></th></tr></thead>
  <tbody>{res.rows.map(a=>(<tr key={a.id}><td>#{a.id}</td><td>{a.title}</td><td>{formatUsd(a.reward)}</td><td>{formatUsd(a.budget,2)}</td><td>{a.views_done}</td>
  <td><span className={'badge badge-'+a.status}>{a.status}</span></td>
  <td>{a.status==='pending'&&(<><form action={setStatus} className="inline-form"><input type="hidden" name="id" value={a.id}/><input type="hidden" name="status" value="active"/><button className="btn btn-sm btn-primary">Activate</button></form>{' '}<form action={setStatus} className="inline-form"><input type="hidden" name="id" value={a.id}/><input type="hidden" name="status" value="rejected"/><button className="btn btn-sm btn-danger">Reject</button></form></>)}</td>
  </tr>))}</tbody></table></div></AdminShell>);
}
