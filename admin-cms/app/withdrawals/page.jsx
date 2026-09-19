import { AdminShell } from '@/components/AdminShell';
import { query, pool } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';
import { notifyUser } from '@/lib/telegram';
export const dynamic = 'force-dynamic';

async function markPaid(formData) {
  'use server';
  const id = formData.get('id');
  const txHash = formData.get('tx_hash') || null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query('SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE', [id]);
    if (!w.rows[0] || w.rows[0].status !== 'pending') throw new Error('Not pending');
    const wd = w.rows[0];
    await client.query("UPDATE withdrawals SET status='paid', tx_hash=$1, processed_at=NOW() WHERE id=$2", [txHash, id]);
    await client.query(
      "INSERT INTO transactions (user_id,type,amount,reference_id,reference_type,note,idempotency_key) VALUES ($1,'withdrawal',$2,$3,'withdrawal','Paid by admin (CMS)',$4) ON CONFLICT (idempotency_key) DO NOTHING",
      [wd.user_id, -parseFloat(wd.amount), id, 'pay_wd_' + id]
    );
    const tb = await client.query("SELECT value FROM settings WHERE key='treasury_balance'");
    const tbal = (parseFloat(tb.rows[0]?.value || '0') || 0) - parseFloat(wd.amount);
    await client.query(
      "INSERT INTO settings (key,value,updated_at) VALUES ('treasury_balance',$1,NOW()) ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()",
      [String(tbal)]
    );
    await client.query(
      "INSERT INTO treasury_logs (type,amount,balance_after,note,tx_hash,idempotency_key) VALUES ('out',$1,$2,$3,$4,$5) ON CONFLICT (idempotency_key) DO NOTHING",
      [-wd.amount, tbal, 'Withdrawal #' + id, txHash, 'treasury_out_wd_' + id]
    );
    await client.query(
      "INSERT INTO audit_logs (actor_type,action,target_type,target_id,details) VALUES ('admin','pay_withdrawal','withdrawal',$1,$2)",
      [String(id), JSON.stringify({ txHash })]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  {
    const row = await query('SELECT user_id, amount, tx_hash FROM withdrawals WHERE id=$1', [id]);
    const r = row.rows[0];
    if (r) {
      const txLine = r.tx_hash ? `\nTx: \`${r.tx_hash}\`` : '';
      await notifyUser(
        r.user_id,
        `✅ *Withdrawal paid*\n\nRequest #${id}\nAmount: *$${parseFloat(r.amount).toFixed(4)} USDT*${txLine}\n\nFunds sent to your wallet.`
      );
    }
  }
  revalidatePath('/withdrawals');
}

async function rejectWd(formData) {
  'use server';
  const id = formData.get('id');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query('SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE', [id]);
    if (!w.rows[0] || w.rows[0].status !== 'pending') throw new Error('Not pending');
    const wd = w.rows[0];
    await client.query("UPDATE withdrawals SET status='rejected', processed_at=NOW(), admin_note=$1 WHERE id=$2", ['Rejected in CMS', id]);
    const u = await client.query('SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE', [wd.user_id]);
    const newBal = parseFloat(u.rows[0].balance) + parseFloat(wd.amount);
    await client.query('UPDATE users SET balance=$1, updated_at=NOW() WHERE telegram_id=$2', [newBal, wd.user_id]);
    await client.query(
      "INSERT INTO transactions (user_id,type,amount,balance_after,reference_id,reference_type,note,idempotency_key) VALUES ($1,'withdrawal_refund',$2,$3,$4,'withdrawal','Refund after reject',$5) ON CONFLICT (idempotency_key) DO NOTHING",
      [wd.user_id, wd.amount, newBal, id, 'reject_wd_' + id]
    );
    await client.query(
      "INSERT INTO audit_logs (actor_type,action,target_type,target_id) VALUES ('admin','reject_withdrawal','withdrawal',$1)",
      [String(id)]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  {
    const row = await query('SELECT user_id, amount FROM withdrawals WHERE id=$1', [id]);
    const r = row.rows[0];
    if (r) {
      await notifyUser(
        r.user_id,
        `❌ *Withdrawal rejected*\n\nRequest #${id}\nAmount: $${parseFloat(r.amount).toFixed(4)} USDT\n\nFunds returned to your balance.`
      );
    }
  }
  revalidatePath('/withdrawals');
}

export default async function Page({ searchParams }) {
  const status = searchParams?.status || 'pending';
  const res = await query(
    "SELECT w.*, u.username FROM withdrawals w LEFT JOIN users u ON w.user_id=u.telegram_id WHERE ($1='all' OR w.status=$1) ORDER BY w.created_at DESC LIMIT 50",
    [status]
  );
  return (
    <AdminShell title="Withdrawals">
      <div className="filters">
        {['pending', 'paid', 'rejected', 'all'].map((s) => (
          <a key={s} href={'?status=' + s} className={status === s ? 'active' : ''}>{s}</a>
        ))}
      </div>
      <p className="muted">Pay USDT from Trust wallet, then mark paid with TxID. Reject refunds the user balance.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>User</th><th>Amount</th><th>Network</th><th>Address</th><th>Status</th><th>Date</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {res.rows.map((w) => (
              <tr key={w.id}>
                <td>#{w.id}</td>
                <td className="mono">{w.user_id}<br/>@{w.username || '—'}</td>
                <td>{formatUsd(w.amount)}</td>
                <td>{w.network}</td>
                <td className="mono">{w.address}</td>
                <td><span className={'badge badge-' + w.status}>{w.status}</span></td>
                <td>{formatDate(w.created_at)}</td>
                <td>
                  {w.status === 'pending' && (
                    <>
                      <form action={markPaid} className="inline-form">
                        <input type="hidden" name="id" value={w.id} />
                        <input name="tx_hash" placeholder="TxID" style={{ width: 110, maxWidth: 110, display: 'inline' }} />
                        <button type="submit" className="btn btn-sm btn-primary">Paid</button>
                      </form>{' '}
                      <form action={rejectWd} className="inline-form">
                        <input type="hidden" name="id" value={w.id} />
                        <button type="submit" className="btn btn-sm btn-danger">Reject</button>
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
