const { pool } = require('../database');
const { updateBalance } = require('./userService');
const { getSetting, setSetting } = require('./settingsService');
const { idempotencyKey } = require('../utils/helpers');
const { audit } = require('../utils/audit');

async function createDeposit({ userId, amount, network, txHash, currency, cryptoAmount, note }) {
  const key = idempotencyKey('deposit', userId, amount, network, txHash || Date.now());
  if (txHash) {
    const dup = await pool.query(`SELECT id FROM deposits WHERE tx_hash=$1`, [txHash]);
    if (dup.rows[0]) throw new Error('This TxID was already submitted.');
  }
  const adminNote = note || (cryptoAmount ? `Send ${cryptoAmount} ${currency || ''}`.trim() : null);
  const res = await pool.query(
    `INSERT INTO deposits (user_id, amount, network, tx_hash, status, idempotency_key, admin_note)
     VALUES ($1,$2,$3,$4,'pending',$5,$6) RETURNING *`,
    [userId, amount, network, txHash || null, key, adminNote]
  );
  return res.rows[0];
}

async function approveDeposit(depositId, adminId, { note, checklist } = {}) {
  const key = idempotencyKey('approve_deposit', depositId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const d = await client.query(`SELECT * FROM deposits WHERE id=$1 FOR UPDATE`, [depositId]);
    if (!d.rows[0]) throw new Error('Deposit not found');
    if (d.rows[0].status !== 'pending') throw new Error('Deposit not pending');
    const dep = d.rows[0];

    await client.query(
      `UPDATE deposits SET status='approved', processed_by=$1, processed_at=NOW(), admin_note=$2, review_checklist=$3 WHERE id=$4`,
      [adminId, note || null, JSON.stringify(checklist || {}), depositId]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const dep = (await pool.query('SELECT * FROM deposits WHERE id=$1', [depositId])).rows[0];
  await updateBalance(dep.user_id, parseFloat(dep.amount), 'deposit', {
    note: `Deposit #${depositId} approved`,
    referenceId: depositId,
    referenceType: 'deposit',
    createdBy: adminId,
    idempotencyKey: key,
  });

  const tb = parseFloat(await getSetting('treasury_balance', '0')) || 0;
  const newTb = tb + parseFloat(dep.amount);
  await setSetting('treasury_balance', String(newTb));
  await pool.query(
    `INSERT INTO treasury_logs (type, amount, balance_after, note, created_by, idempotency_key)
     VALUES ('in',$1,$2,$3,$4,$5) ON CONFLICT (idempotency_key) DO NOTHING`,
    [dep.amount, newTb, `Deposit #${depositId}`, adminId, idempotencyKey('treasury_in_dep', depositId)]
  );
  await audit({ actorId: adminId, action: 'approve_deposit', targetType: 'deposit', targetId: depositId });
  return dep;
}

async function rejectDeposit(depositId, adminId, note) {
  const res = await pool.query(
    `UPDATE deposits SET status='rejected', processed_by=$1, processed_at=NOW(), admin_note=$2
     WHERE id=$3 AND status='pending' RETURNING *`,
    [adminId, note || null, depositId]
  );
  if (!res.rows[0]) throw new Error('Not pending');
  await audit({ actorId: adminId, action: 'reject_deposit', targetType: 'deposit', targetId: depositId, details: { note } });
  return res.rows[0];
}

async function createWithdrawal({ userId, amount, network, address }) {
  const min = parseFloat(await getSetting('min_withdraw', '5'));
  if (amount < min) throw new Error(`Minimum withdrawal is ${min} USDT`);
  const key = idempotencyKey('wd_req', userId, amount, network, address, Date.now());

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query('SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE', [userId]);
    if (!u.rows[0] || parseFloat(u.rows[0].balance) < amount) throw new Error('Insufficient balance');
    const newBal = parseFloat(u.rows[0].balance) - amount;
    await client.query('UPDATE users SET balance=$1, updated_at=NOW() WHERE telegram_id=$2', [newBal, userId]);
    const res = await client.query(
      `INSERT INTO withdrawals (user_id, amount, network, address, status, idempotency_key)
       VALUES ($1,$2,$3,$4,'pending',$5) RETURNING *`,
      [userId, amount, network, address, key]
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, reference_type, note, idempotency_key)
       VALUES ($1,'withdrawal_hold',$2,$3,$4,'withdrawal','Hold for withdrawal',$5)`,
      [userId, -amount, newBal, res.rows[0].id, idempotencyKey('wd_hold', res.rows[0].id)]
    );
    await client.query('COMMIT');
    return res.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function approveWithdrawal(withdrawalId, adminId, txHash, note) {
  const key = idempotencyKey('pay_wd', withdrawalId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query(`SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE`, [withdrawalId]);
    if (!w.rows[0] || w.rows[0].status !== 'pending') throw new Error('Invalid withdrawal status');
    const wd = w.rows[0];
    await client.query(
      `UPDATE withdrawals SET status='paid', tx_hash=$1, processed_by=$2, processed_at=NOW(), admin_note=$3 WHERE id=$4`,
      [txHash || null, adminId, note || null, withdrawalId]
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, reference_id, reference_type, note, created_by, idempotency_key)
       VALUES ($1,'withdrawal',$2,$3,'withdrawal',$4,$5,$6) ON CONFLICT (idempotency_key) DO NOTHING`,
      [wd.user_id, -parseFloat(wd.amount), withdrawalId, note || 'Paid by admin', adminId, key]
    );
    const tb = parseFloat(await getSetting('treasury_balance', '0')) || 0;
    const newTb = tb - parseFloat(wd.amount);
    await client.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('treasury_balance',$1,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [String(newTb)]
    );
    await client.query(
      `INSERT INTO treasury_logs (type, amount, balance_after, note, tx_hash, created_by, idempotency_key)
       VALUES ('out',$1,$2,$3,$4,$5,$6) ON CONFLICT (idempotency_key) DO NOTHING`,
      [-wd.amount, newTb, `Withdrawal #${withdrawalId}`, txHash, adminId, idempotencyKey('treasury_out_wd', withdrawalId)]
    );
    await client.query('COMMIT');
    await audit({ actorId: adminId, action: 'pay_withdrawal', targetType: 'withdrawal', targetId: withdrawalId, details: { txHash } });
    return wd;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function rejectWithdrawal(withdrawalId, adminId, note) {
  const key = idempotencyKey('reject_wd', withdrawalId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query(`SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE`, [withdrawalId]);
    if (!w.rows[0] || w.rows[0].status !== 'pending') throw new Error('Not pending');
    const wd = w.rows[0];
    await client.query(
      `UPDATE withdrawals SET status='rejected', processed_by=$1, processed_at=NOW(), admin_note=$2 WHERE id=$3`,
      [adminId, note || null, withdrawalId]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  const wd = (await pool.query('SELECT * FROM withdrawals WHERE id=$1', [withdrawalId])).rows[0];
  await updateBalance(wd.user_id, parseFloat(wd.amount), 'withdrawal_refund', {
    note: `Withdrawal #${withdrawalId} rejected`,
    referenceId: withdrawalId,
    referenceType: 'withdrawal',
    createdBy: adminId,
    idempotencyKey: key,
  });
  await audit({ actorId: adminId, action: 'reject_withdrawal', targetType: 'withdrawal', targetId: withdrawalId });
  return wd;
}

async function addTreasuryTransaction({ type, amount, note, txHash, adminId }) {
  const delta = type === 'out' ? -Math.abs(amount) : Math.abs(amount);
  const key = idempotencyKey('treasury', type, amount, note, Date.now());
  const tb = parseFloat(await getSetting('treasury_balance', '0')) || 0;
  const newTb = tb + delta;
  await setSetting('treasury_balance', String(newTb));
  await pool.query(
    `INSERT INTO treasury_logs (type, amount, balance_after, note, tx_hash, created_by, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [type, delta, newTb, note, txHash || null, adminId, key]
  );
  await pool.query(
    `INSERT INTO transactions (user_id, type, amount, note, created_by, idempotency_key)
     VALUES (NULL,$1,$2,$3,$4,$5)`,
    [type === 'out' ? 'treasury_out' : 'treasury_in', delta, note, adminId, idempotencyKey('tx_treasury', key)]
  );
  return newTb;
}

module.exports = {
  createDeposit,
  approveDeposit,
  rejectDeposit,
  createWithdrawal,
  approveWithdrawal,
  rejectWithdrawal,
  addTreasuryTransaction,
};
