import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';
async function add(formData) { 'use server'; await query('INSERT INTO payment_addresses (network,currency,address,label,is_active) VALUES ($1,$2,$3,$4,TRUE)', [formData.get('network'), formData.get('currency')||'USDT', formData.get('address'), formData.get('label')]); revalidatePath('/addresses'); }
async function del(formData) { 'use server'; await query('DELETE FROM payment_addresses WHERE id=$1', [formData.get('id')]); revalidatePath('/addresses'); }
export default async function Page() {
  const res = await query('SELECT * FROM payment_addresses ORDER BY network');
  return (<AdminShell title="Payment Addresses"><p className="muted">No payment API — manage addresses here.</p>
  <div className="table-wrap" style={{marginBottom:24}}><table><thead><tr><th>Network</th><th>Currency</th><th>Address</th><th>Label</th><th></th></tr></thead>
  <tbody>{res.rows.map(a=>(<tr key={a.id}><td>{a.network}</td><td>{a.currency}</td><td className="mono">{a.address}</td><td>{a.label||'—'}</td>
  <td><form action={del} className="inline-form"><input type="hidden" name="id" value={a.id}/><button className="btn btn-sm btn-danger">Delete</button></form></td></tr>))}</tbody></table></div>
  <div className="form-card"><form action={add}>
  <div className="form-group"><label>Network</label><input name="network" placeholder="TRC20" required/></div>
  <div className="form-group"><label>Currency</label><input name="currency" defaultValue="USDT"/></div>
  <div className="form-group"><label>Address</label><input name="address" required/></div>
  <div className="form-group"><label>Label</label><input name="label"/></div>
  <button className="btn btn-primary">Save</button></form></div></AdminShell>);
}
