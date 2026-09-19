import { AdminShell } from '@/components/AdminShell';
import { query, pool } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function approveDeposit(formData) {
  'use server';
  const id = formData.get('id');
  const checklist = {
    amount_matches: formData.get('amount_matches') === 'on',
    tx_on_explorer: formData.get('tx_on_explorer') === 'on',
    address_correct: formData.get('address_correct') === 'on',
    no_duplicate_tx: formData.get('no_duplicate_tx') === 'on',
  };
  if (!Object.values(checklist).every(Boolean)) {
    throw new Error('Complete all review checklist items before approving');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const d = await client.query(`SELECT * FROM deposits WHERE id=$1 FOR UPDATE`, [id]);
    if (!d.rows[0] || d.rows[0].status !== 'pending') throw new Error('Deposit is not pending');
    const dep = d.rows[0];

    await client.query(
      `UPDATE deposits SET status='approved', processed_at=NOW(), review_checklist=$1 WHERE id=$2`,
      [JSON.stringify(checklist), id]
    );

    const u = await client.query(`SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE`, [dep.user_id]);
    if (!u.rows[0]) throw new Error('User not found');
    const newBal = parseFloat(u.rows[0].balance) + parseFloat(dep.amount);
    await client.query(
      `UPDATE users SET balance=$1, total_earned=total_earned+$2, updated_at=NOW() WHERE telegram_id=$3`,
      [newBal, dep.amount, dep.user_id]
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, reference_type, note, idempotency_key)
       VALUES ($1,'deposit',$2,$3,$4,'deposit','Deposit approved (CMS)',$5)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [dep.user_id, dep.amount, newBal, id, `approve_dep_${id}`]
    );

    const tb = await client.query(`SELECT value FROM settings WHERE key='treasury_balance'`);
    const tbal = (parseFloat(tb.rows[0]?.value || '0') || 0) + parseFloat(dep.amount);
    await client.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('treasury_balance',$1,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [String(tbal)]
    );
    await client.query(
      `INSERT INTO treasury_logs (type, amount, balance_after, note, idempotency_key)
       VALUES ('in',$1,$2,$3,$4) ON CONFLICT (idempotency_key) DO NOTHING`,
      [dep.amount, tbal, `Deposit #${id}`, `treasury_in_dep_${id}`]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_type, action, target_type, target_id, details)
       VALUES ('admin','approve_deposit','deposit',$1,$2)`,
      [String(id), JSON.stringify(checklist)]
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

async function rejectDeposit(formData) {
  'use server';
  const id = formData.get('id');
  await query(
    `UPDATE deposits SET status='rejected', processed_at=NOW(), admin_note=$1
     WHERE id=$2 AND status='pending'`,
    [formData.get('note') || 'Rejected in CMS', id]
  );
  await query(
    `INSERT INTO audit_logs (actor_type, action, target_type, target_id)
     VALUES ('admin','reject_deposit','deposit',$1)`,
    [String(id)]
  );
  revalidatePath('/deposits');
}

export default async function DepositsPage({ searchParams }) {
  const status = searchParams?.status || 'pending';
  const res = await query(
    `SELECT d.*, u.username FROM deposits d
     LEFT JOIN users u ON d.user_id = u.telegram_id
     WHERE ($1 = 'all' OR d.status = $1)
     ORDER BY d.created_at DESC LIMIT 50`,
    [status]
  );

  return (
    <AdminShell title="Deposits — Review">
      <div className="filters">
        {['pending', 'approved', 'rejected', 'all'].map((s) => (
          <a key={s} href={`?status=${s}`} className={status === s ? 'active' : ''}>{s}</a>
        ))}
      </div>
      <p className="muted" style={{ marginBottom: 12 }}>
        Matches bot deposit flow. Checklist required. Duplicate TxIDs blocked by unique index.
      </p>
      {res.rows.map((d) => (
        <div key={d.id} className="form-card" style={{ maxWidth: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <strong>#{d.id}</strong> · {formatUsd(d.amount)} · {d.network}
              <div className="mono muted">User {d.user_id} @{d.username || '—'}</div>
              <div className="mono">Tx: {d.tx_hash || '—'}</div>
              <div className="muted">{formatDate(d.created_at)}</div>
            </div>
            <span className={`badge badge-${d.status}`}>{d.status}</span>
          </div>
          {d.status === 'pending' && (
            <>
              <form action={approveDeposit} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={d.id} />
                <div className="checklist">
                  <label><input type="checkbox" name="amount_matches" /> Amount matches on-chain</label>
                  <label><input type="checkbox" name="tx_on_explorer" /> Tx confirmed on explorer</label>
                  <label><input type="checkbox" name="address_correct" /> Sent to our payment address</label>
                  <label><input type="checkbox" name="no_duplicate_tx" /> TxID not used before</label>
                </div>
                <button type="submit" className="btn btn-primary btn-sm">Approve &amp; Credit</button>
              </form>
              <form action={rejectDeposit} className="inline-form" style={{ marginLeft: 8 }}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="note" value="Rejected in CMS" />
                <button type="submit" className="btn btn-danger btn-sm">Reject</button>
              </form>
            </>
          )}
        </div>
      ))}
      {!res.rows.length && <p className="muted">No deposits for this filter.</p>}
    </AdminShell>
  );
}
