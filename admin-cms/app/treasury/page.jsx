import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';
async function addTx(formData) {
  'use server';
  const type = formData.get('type'); const amount = Math.abs(parseFloat(formData.get('amount')));
  const note = formData.get('note'); const txHash = formData.get('tx_hash')||null;
  const delta = type==='out' ? -amount : amount;
  const tb = await query("SELECT value FROM settings WHERE key='treasury_balance'");
  const newTb = (parseFloat(tb.rows[0]?.value||'0')||0)+delta;
  await query("INSERT INTO settings (key,value,updated_at) VALUES ('treasury_balance',$1,NOW()) ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()", [String(newTb)]);
  await query('INSERT INTO treasury_logs (type,amount,balance_after,note,tx_hash) VALUES ($1,$2,$3,$4,$5)', [type, delta, newTb, note, txHash]);
  await query('INSERT INTO transactions (user_id,type,amount,note) VALUES (NULL,$1,$2,$3)', [type==='out'?'treasury_out':'treasury_in', delta, note]);
  revalidatePath('/treasury');
}
async function setAddr(formData) {
  'use server';
  await query("INSERT INTO settings (key,value,updated_at) VALUES ('trust_wallet_address',$1,NOW()) ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()", [formData.get('address')||'']);
  revalidatePath('/treasury');
}
export default async function Page() {
  const bal = await query("SELECT value FROM settings WHERE key='treasury_balance'");
  const addr = await query("SELECT value FROM settings WHERE key='trust_wallet_address'");
  const logs = await query('SELECT * FROM treasury_logs ORDER BY created_at DESC LIMIT 40');
  return (<AdminShell title="Treasury / Trust Wallet">
    <div className="cards"><div className="card"><div className="label">Balance</div><div className="value">{formatUsd(bal.rows[0]?.value||0)}</div></div></div>
    <div className="form-card"><form action={setAddr}><div className="form-group"><label>Trust Wallet</label><input name="address" defaultValue={addr.rows[0]?.value||''} style={{maxWidth:'100%'}}/></div><button className="btn btn-ghost">Update</button></form></div>
    <div className="form-card"><form action={addTx}>
      <div className="form-group"><label>Type</label><select name="type"><option value="in">In</option><option value="out">Out</option></select></div>
      <div className="form-group"><label>Amount</label><input type="number" step="0.0001" name="amount" required/></div>
      <div className="form-group"><label>Note</label><input name="note"/></div>
      <div className="form-group"><label>Tx</label><input name="tx_hash"/></div>
      <button className="btn btn-primary">Record</button>
    </form></div>
    <div className="table-wrap"><table><thead><tr><th>Type</th><th>Amount</th><th>After</th><th>Note</th><th>Date</th></tr></thead>
    <tbody>{logs.rows.map(l=>(<tr key={l.id}><td>{l.type}</td><td>{formatUsd(l.amount)}</td><td>{formatUsd(l.balance_after)}</td><td>{l.note||'—'}</td><td>{formatDate(l.created_at)}</td></tr>))}</tbody></table></div>
  </AdminShell>);
}
