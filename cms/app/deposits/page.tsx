import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function approve(formData: FormData) {
  'use server';
  const id = formData.get('id') as string;
  const client = await (await import('@/lib/db')).pool.connect();
  try {
    await client.query('BEGIN');
    const d = await client.query(`SELECT * FROM deposits WHERE id=$1 FOR UPDATE`, [id]);
    if (!d.rows[0] || d.rows[0].status !== 'pending') throw new Error('Not pending');
    const dep = d.rows[0];
    await client.query(`UPDATE deposits SET status='approved', processed_at=NOW() WHERE id=$1`, [id]);
    const u = await client.query(`SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE`, [dep.user_id]);
    const newBal = parseFloat(u.rows[0].balance) + parseFloat(dep.amount);
    await client.query(`UPDATE users SET balance=$1, total_earned=total_earned+$2, updated_at=NOW() WHERE telegram_id=$3`, [newBal, dep.amount, dep.user_id]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, reference_type, note)
       VALUES ($1,'deposit',$2,$3,$4,'deposit','Deposit approved')`,
      [dep.user_id, dep.amount, newBal, id]
    );
    const tb = await client.query(`SELECT value FROM settings WHERE key='treasury_balance'`);
    const tbal = (parseFloat(tb.rows[0]?.value || '0') || 0) + parseFloat(dep.amount);
    await client.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('treasury_balance',$1,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [String(tbal)]
    );
    await client.query(
      `INSERT INTO treasury_logs (type, amount, balance_after, note) VALUES ('in',$1,$2,$3)`,
      [dep.amount, tbal, `Deposit #${id}`]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  revalidatePath('/deposits');
}

async function reject(formData: FormData) {
  'use server';
  const id = formData.get('id') as string;
  await query(`UPDATE deposits SET status='rejected', processed_at=NOW() WHERE id=$1 AND status='pending'`, [id]);
  revalidatePath('/deposits');
}

export default async function DepositsPage({ searchParams }: { searchParams: { status?: string } }) {
  const status = searchParams.status || 'pending';
  const res = await query(
    `SELECT d.*, u.username FROM deposits d LEFT JOIN users u ON d.user_id=u.telegram_id
     WHERE ($1='all' OR d.status=$1) ORDER BY d.created_at DESC LIMIT 100`,
    [status]
  );

  return (
    <AdminShell title="Deposits">
      <div className="filters">
        {['pending', 'approved', 'rejected', 'all'].map((s) => (
          <a key={s} href={`?status=${s}`} className={status === s ? 'active' : ''}>{s}</a>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>User</th><th>Amount</th><th>Network</th><th>Tx</th><th>Status</th><th>Date</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {res.rows.map((d) => (
              <tr key={d.id}>
                <td>#{d.id}</td>
                <td>{d.user_id} @{d.username || '—'}</td>
                <td>{formatUsd(d.amount)}</td>
                <td>{d.network}</td>
                <td className="mono" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.tx_hash || '—'}</td>
                <td><span className={`badge badge-${d.status}`}>{d.status}</span></td>
                <td>{formatDate(d.created_at)}</td>
                <td>
                  {d.status === 'pending' && (
                    <>
                      <form action={approve} className="inline-form">
                        <input type="hidden" name="id" value={d.id} />
                        <button className="btn btn-sm btn-primary">Approve</button>
                      </form>{' '}
                      <form action={reject} className="inline-form">
                        <input type="hidden" name="id" value={d.id} />
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
