import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';

async function addAddress(formData) {
  'use server';
  await query(
    `INSERT INTO payment_addresses (network, currency, address, label, is_active, min_amount, fee_percent, rate_usd)
     VALUES ($1,$2,$3,$4,TRUE,$5,$6,$7)`,
    [
      formData.get('network'),
      formData.get('currency') || 'USDT',
      formData.get('address'),
      formData.get('label') || null,
      formData.get('min_amount') || 1,
      formData.get('fee_percent') || 0,
      formData.get('rate_usd') || null,
    ]
  );
  await query("INSERT INTO audit_logs (actor_type,action,target_type,details) VALUES ('admin','add_payment_address','payment_address',$1)", [JSON.stringify({ network: formData.get('network') })]);
  revalidatePath('/addresses');
}
async function toggleAddress(formData) {
  'use server';
  await query('UPDATE payment_addresses SET is_active = NOT is_active, updated_at=NOW() WHERE id=$1', [formData.get('id')]);
  revalidatePath('/addresses');
}
async function deleteAddress(formData) {
  'use server';
  await query('DELETE FROM payment_addresses WHERE id=$1', [formData.get('id')]);
  revalidatePath('/addresses');
}

export default async function Page() {
  const res = await query('SELECT * FROM payment_addresses ORDER BY network, id');
  return (
    <AdminShell title="Payment Addresses">
      <p className="muted" style={{ marginBottom: 12 }}>
        Shown to users in the bot for USDT deposits. No external payment API.
      </p>
      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table>
          <thead>
            <tr><th>Network</th><th>Currency</th><th>Address</th><th>Min $</th><th>Fee %</th><th>Rate</th><th>Active</th><th></th></tr>
          </thead>
          <tbody>
            {res.rows.map((a) => (
              <tr key={a.id}>
                <td>{a.network}</td>
                <td>{a.currency}</td>
                <td className="mono">{a.address}</td>
                <td>{a.min_amount ?? '1'}</td>
                <td>{a.fee_percent ?? '0'}</td>
                <td>{a.rate_usd ? `$${a.rate_usd}` : 'live'}</td>
                <td>{a.is_active ? 'Yes' : 'No'}</td>
                <td>
                  <form action={toggleAddress} className="inline-form">
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="btn btn-sm btn-ghost">{a.is_active ? 'Disable' : 'Enable'}</button>
                  </form>{' '}
                  <form action={deleteAddress} className="inline-form">
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="btn btn-sm btn-danger">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-card">
        <form action={addAddress}>
          <div className="form-group"><label>Network</label><input name="network" placeholder="TRC20" required /></div>
          <div className="form-group"><label>Currency</label><input name="currency" defaultValue="USDT" /></div>
          <div className="form-group"><label>Address</label><input name="address" required style={{ maxWidth: '100%' }} /></div>
          <div className="form-group"><label>Label</label><input name="label" placeholder="USDT TRC20 / BTC main" /></div>
          <div className="form-group"><label>Min deposit (USD value)</label><input name="min_amount" type="number" step="0.01" defaultValue="1" /></div>
          <div className="form-group"><label>Fee %</label><input name="fee_percent" type="number" step="0.01" defaultValue="0" /></div>
          <div className="form-group"><label>Rate USD (optional override; empty = live market)</label><input name="rate_usd" type="number" step="0.0001" placeholder="Leave empty for live" /></div>
          <button type="submit" className="btn btn-primary">Add address</button>
        </form>
      </div>
    </AdminShell>
  );
}
