import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

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
  revalidatePath('/addresses');
  redirect('/addresses?ok=' + encodeURIComponent('Payment method added'));
}

async function toggleAddress(formData) {
  'use server';
  const id = formData.get('id');
  await query(`UPDATE payment_addresses SET is_active = NOT is_active, updated_at=NOW() WHERE id=$1`, [id]);
  revalidatePath('/addresses');
  redirect('/addresses?ok=' + encodeURIComponent('Method updated'));
}

async function deleteAddress(formData) {
  'use server';
  await query(`DELETE FROM payment_addresses WHERE id=$1`, [formData.get('id')]);
  revalidatePath('/addresses');
  redirect('/addresses?ok=' + encodeURIComponent('Method removed'));
}

export default async function AddressesPage() {
  const res = await query(`SELECT * FROM payment_addresses ORDER BY currency, network`);

  return (
    <AdminShell title="Payment methods">
      <div className="page-header">
        <h2>Deposit addresses</h2>
        <p>
          Users deposit any configured coin. Balance is always USDT. Live market rates apply unless you set a fixed
          Rate USD. Fee % is charged on top of the credit amount (user sends credit + fee).
        </p>
      </div>

      <div className="panel" style={{ marginBottom: '1.25rem' }}>
        <div className="panel-header">
          <h3>How pricing works</h3>
        </div>
        <div className="panel-body" style={{ padding: '0.85rem 1.15rem', fontSize: '0.875rem' }}>
          <p className="muted" style={{ margin: 0 }}>
            User wants <strong>$10 USDT credit</strong>, method fee 2%, USDT TRC20 → pays ≈ $10.20 USDT to your address.
            BTC method uses live (or fixed) BTC/USD rate so they send the exact BTC for $10 + fee.
          </p>
          <p className="muted" style={{ margin: '0.5rem 0 0' }}>
            Suggested coins: USDT (TRC20/BEP20/ERC20), USDC, BTC, ETH, BNB, SOL, TON, TRX.
          </p>
        </div>
      </div>

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Network</th>
              <th>Coin</th>
              <th>Address</th>
              <th>Min $</th>
              <th>Fee %</th>
              <th>Rate</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {res.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted" style={{ textAlign: 'center' }}>
                  No methods yet — add USDT TRC20 first
                </td>
              </tr>
            )}
            {res.rows.map((a) => (
              <tr key={a.id}>
                <td>{a.network}</td>
                <td>
                  <strong>{a.currency}</strong>
                  {a.label ? <div className="muted" style={{ fontSize: '0.75rem' }}>{a.label}</div> : null}
                </td>
                <td className="mono" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.address}
                </td>
                <td>${a.min_amount ?? '1'}</td>
                <td>{a.fee_percent ?? '0'}%</td>
                <td>{a.rate_usd ? `$${a.rate_usd}` : 'live'}</td>
                <td>{a.is_active ? <span className="badge badge-active">On</span> : <span className="badge">Off</span>}</td>
                <td>
                  <form action={toggleAddress} className="inline-form">
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="btn btn-sm btn-ghost">
                      {a.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </form>{' '}
                  <form action={deleteAddress} className="inline-form">
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="btn btn-sm btn-danger">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-card">
        <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Add payment method</h3>
        <form action={addAddress}>
          <div className="form-group">
            <label>Network</label>
            <input name="network" placeholder="TRC20 / BEP20 / ERC20 / BTC / SOL / TON" required />
          </div>
          <div className="form-group">
            <label>Currency (coin)</label>
            <input name="currency" defaultValue="USDT" placeholder="USDT, BTC, ETH…" />
          </div>
          <div className="form-group">
            <label>Deposit address (Trust wallet)</label>
            <input name="address" required style={{ maxWidth: '100%' }} />
          </div>
          <div className="form-group">
            <label>Label (optional)</label>
            <input name="label" placeholder="Main USDT TRC20" />
          </div>
          <div className="form-group">
            <label>Min deposit (USD credit)</label>
            <input name="min_amount" type="number" step="0.01" defaultValue="5" />
          </div>
          <div className="form-group">
            <label>Platform fee %</label>
            <input name="fee_percent" type="number" step="0.01" defaultValue="0" />
          </div>
          <div className="form-group">
            <label>Fixed USD rate (optional)</label>
            <input name="rate_usd" type="number" step="0.00000001" placeholder="Empty = live CoinGecko" />
          </div>
          <button type="submit" className="btn btn-primary">
            Add method
          </button>
        </form>
      </div>
    </AdminShell>
  );
}
