import { AdminShell } from '@/components/AdminShell';
import { query, pool } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function markPaid(formData: FormData) {
  'use server';
  const id = formData.get('id') as string;
  const txHash = (formData.get('tx_hash') as string) || null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query(`SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE`, [id]);
    if (!w.rows[0] || w.rows[0].status !== 'pending') throw new Error('Not pending');
    const wd = w.rows[0];
    await client.query(
      `UPDATE withdrawals SET status='paid', tx_hash=$1, processed_at=NOW() WHERE id=$2`,
      [txHash, id]
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, reference_id, reference_type, note)
       VALUES ($1,'withdrawal',$2,$3,'withdrawal','Paid by admin')`,
      [wd.user_id, -parseFloat(wd.amount), id]
    );
    const tb = await client.query(`SELECT value FROM settings WHERE key='treasury_balance'`);
    const tbal = (parseFloat(tb.rows[0]?.value || '0') || 0) - parseFloat(wd.amount);
    await client.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('treasury_balance',$1,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [String(tbal)]
    );
    await client.query(
      `INSERT INTO treasury_logs (type, amount, balance_after, note, tx_hash) VALUES ('out',$1,$2,$3,$4)`,
      [-wd.amount, tbal, `Withdrawal #${id}`, txHash]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  revalidatePath('/withdrawals');
}

async function rejectWd(formData: FormData) {
  'use server';
  const id = formData.get('id') as string;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query(`SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE`, [id]);
    if (!w.rows[0] || w.rows[0].status !== 'pending') throw new Error('Not pending');
    const wd = w.rows[0];
    await client.query(`UPDATE withdrawals SET status='rejected', processed_at=NOW() WHERE id=$1`, [id]);
    const u = await client.query(`SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE`, [wd.user_id]);
    const newBal = parseFloat(u.rows[0].balance) + parseFloat(wd.amount);
    await client.query(`UPDATE users SET balance=$1, updated_at=NOW() WHERE telegram_id=$2`, [newBal, wd.user_id]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, reference_type, note)
       VALUES ($1,'withdrawal_refund',$2,$3,$4,'withdrawal','Rejected – refunded')`,
      [wd.user_id, wd.amount, newBal, id]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  revalidatePath('/withdrawals');
}

export default async function WithdrawalsPage({ searchParams }: { searchParams: { status?: string } }) {
  const status = searchParams.status || 'pending';
  const res = await query(
    `SELECT w.*, u.username FROM withdrawals w LEFT JOIN users u ON w.user_id=u.telegram_id
     WHERE ($1='all' OR w.status=$1) ORDER BY w.created_at DESC LIMIT 100`,
    [status]
  );

  return (
    <AdminShell title="Withdrawals">
      <div className="filters">
        {['pending', 'paid', 'rejected', 'all'].map((s) => (
          <a key={s} href={`?status=${s}`} className={status === s ? 'active' : ''}>{s}</a>
        ))}
      </div>
      <p className="muted" style={{ marginBottom: 12 }}>
        Pay users manually from the Trust wallet, then mark as paid with the TxID.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>User</th><th>Amount</th><th>Network</th><th>Address</th><th>Status</th><th>Date</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {res.rows.map((w) => (
              <tr key={w.id}>
                <td>#{w.id}</td>
                <td>{w.user_id} @{w.username || '—'}</td>
                <td>{formatUsd(w.amount)}</td>
                <td>{w.network}</td>
                <td className="mono" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.address}</td>
                <td><span className={`badge badge-${w.status}`}>{w.status}</span></td>
                <td>{formatDate(w.created_at)}</td>
                <td>
                  {w.status === 'pending' && (
                    <>
                      <form action={markPaid} className="inline-form">
                        <input type="hidden" name="id" value={w.id} />
                        <input name="tx_hash" placeholder="TxID" style={{ width: 100, maxWidth: 100, display: 'inline-block', marginRight: 4 }} />
                        <button className="btn btn-sm btn-primary">Mark Paid</button>
                      </form>{' '}
                      <form action={rejectWd} className="inline-form">
                        <input type="hidden" name="id" value={w.id} />
                        <button className="btn btn-sm btn-danger">Reject</button>
                      </form>
                    </>
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
