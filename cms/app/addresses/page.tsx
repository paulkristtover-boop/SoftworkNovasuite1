import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function addAddress(formData: FormData) {
  'use server';
  await query(
    `INSERT INTO payment_addresses (network, currency, address, label, is_active)
     VALUES ($1,$2,$3,$4,TRUE)`,
    [
      formData.get('network'),
      formData.get('currency') || 'USDT',
      formData.get('address'),
      formData.get('label') || null,
    ]
  );
  revalidatePath('/addresses');
}

async function deleteAddress(formData: FormData) {
  'use server';
  await query(`DELETE FROM payment_addresses WHERE id=$1`, [formData.get('id')]);
  revalidatePath('/addresses');
}

export default async function AddressesPage() {
  const res = await query(`SELECT * FROM payment_addresses ORDER BY network`);

  return (
    <AdminShell title="Payment Addresses">
      <p className="muted" style={{ marginBottom: 16 }}>
        These addresses are shown to users for deposits. Fully editable — no external API.
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
                <td className="mono" style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>{a.address}</td>
                <td>{a.label || '—'}</td>
                <td>{a.is_active ? 'Yes' : 'No'}</td>
                <td>
                  <form action={deleteAddress} className="inline-form">
                    <input type="hidden" name="id" value={a.id} />
                    <button className="btn btn-sm btn-danger">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-card">
        <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>Add Address</h2>
        <form action={addAddress}>
          <div className="form-group"><label>Network</label><input name="network" placeholder="TRC20" required /></div>
          <div className="form-group"><label>Currency</label><input name="currency" defaultValue="USDT" /></div>
          <div className="form-group"><label>Address</label><input name="address" required /></div>
          <div className="form-group"><label>Label</label><input name="label" placeholder="Main TRC20" /></div>
          <button type="submit" className="btn btn-primary">Save Address</button>
        </form>
      </div>
    </AdminShell>
  );
}
