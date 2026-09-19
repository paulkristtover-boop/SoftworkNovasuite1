import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';

async function addAddress(formData) {
  'use server';
  await query(
    'INSERT INTO payment_addresses (network, currency, address, label, is_active) VALUES ($1,$2,$3,$4,TRUE)',
    [formData.get('network'), formData.get('currency') || 'USDT', formData.get('address'), formData.get('label') || null]
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
            <tr><th>Network</th><th>Currency</th><th>Address</th><th>Label</th><th>Active</th><th></th></tr>
          </thead>
          <tbody>
            {res.rows.map((a) => (
              <tr key={a.id}>
                <td>{a.network}</td>
                <td>{a.currency}</td>
                <td className="mono">{a.address}</td>
                <td>{a.label || '—'}</td>
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
          <div className="form-group"><label>Label</label><input name="label" placeholder="Main TRC20" /></div>
          <button type="submit" className="btn btn-primary">Add address</button>
        </form>
      </div>
    </AdminShell>
  );
}
