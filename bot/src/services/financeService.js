const { pool } = require('../database');
const { updateBalance } = require('./userService');
const { getSetting } = require('./settingsService');
const { logger } = require('../utils/logger');

async function createDeposit({ userId, amount, network, txHash, proofUrl }) {
  const res = await pool.query(
    `INSERT INTO deposits (user_id, amount, network, tx_hash, proof_url, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
    [userId, amount, network, txHash || null, proofUrl || null]
  );
  return res.rows[0];
}

async function approveDeposit(depositId, adminId, note = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const d = await client.query('SELECT * FROM deposits WHERE id = $1 FOR UPDATE', [depositId]);
    if (!d.rows[0] || d.rows[0].status !== 'pending') throw new Error('Deposit not pending');
    const dep = d.rows[0];

    await client.query(
      `UPDATE deposits SET status = 'approved', processed_by = $1, processed_at = NOW(), admin_note = $2 WHERE id = $3`,
      [adminId, note, depositId]
    );

    // Credit user
    await client.query('COMMIT');
    await updateBalance(dep.user_id, parseFloat(dep.amount), 'deposit', `Deposit #${depositId} approved`, depositId, 'deposit', adminId);

    // Optional: increase treasury
    const tb = parseFloat(await getSetting('treasury_balance', '0')) || 0;
    await pool.query(
      `INSERT INTO treasury_logs (type, amount, balance_after, note, created_by)
       VALUES ('in', $1, $2, $3, $4)`,
      [dep.amount, tb + parseFloat(dep.amount), `Deposit #${depositId}`, adminId]
    );
    await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('treasury_balance', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [String(tb + parseFloat(dep.amount))]
    );

    return dep;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function rejectDeposit(depositId, adminId, note = null) {
  const res = await pool.query(
    `UPDATE deposits SET status = 'rejected', processed_by = $1, processed_at = NOW(), admin_note = $2
     WHERE id = $3 AND status = 'pending' RETURNING *`,
    [adminId, note, depositId]
  );
  return res.rows[0];
}

async function createWithdrawal({ userId, amount, network, address }) {
  const min = parseFloat(await getSetting('min_withdraw', '5'));
  if (amount < min) throw new Error(`Minimum withdrawal is ${min} USDT`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query('SELECT balance FROM users WHERE telegram_id = $1 FOR UPDATE', [userId]);
    if (!u.rows[0] || parseFloat(u.rows[0].balance) < amount) throw new Error('Insufficient balance');

    // Hold balance (deduct immediately)
    const newBal = parseFloat(u.rows[0].balance) - amount;
    await client.query('UPDATE users SET balance = $1, updated_at = NOW() WHERE telegram_id = $2', [newBal, userId]);

    const res = await client.query(
      `INSERT INTO withdrawals (user_id, amount, network, address, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [userId, amount, network, address]
    );

    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, reference_type, note)
       VALUES ($1, 'withdrawal_hold', $2, $3, $4, 'withdrawal', 'Withdrawal request')`,
      [userId, -amount, newBal, res.rows[0].id]
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

async function approveWithdrawal(withdrawalId, adminId, txHash = null, note = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [withdrawalId]);
    if (!w.rows[0] || !['pending', 'approved'].includes(w.rows[0].status)) throw new Error('Invalid withdrawal status');
    const wd = w.rows[0];

    await client.query(
      `UPDATE withdrawals SET status = 'paid', tx_hash = $1, processed_by = $2, processed_at = NOW(), admin_note = $3 WHERE id = $4`,
      [txHash, adminId, note, withdrawalId]
    );

    // Record final withdrawal transaction
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, reference_id, reference_type, note, created_by)
       VALUES ($1, 'withdrawal', $2, $3, 'withdrawal', $4, $5)`,
      [wd.user_id, -parseFloat(wd.amount), withdrawalId, note || 'Paid by admin', adminId]
    );

    // Decrease treasury
    const tb = parseFloat(await getSetting('treasury_balance', '0')) || 0;
    const newTb = tb - parseFloat(wd.amount);
    await client.query(
      `INSERT INTO treasury_logs (type, amount, balance_after, note, tx_hash, created_by)
       VALUES ('out', $1, $2, $3, $4, $5)`,
      [-wd.amount, newTb, `Withdrawal #${withdrawalId} paid`, txHash, adminId]
    );
    await client.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('treasury_balance', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [String(newTb)]
    );

    await client.query('COMMIT');
    return wd;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function rejectWithdrawal(withdrawalId, adminId, note = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [withdrawalId]);
    if (!w.rows[0] || w.rows[0].status !== 'pending') throw new Error('Not pending');
    const wd = w.rows[0];

    await client.query(
      `UPDATE withdrawals SET status = 'rejected', processed_by = $1, processed_at = NOW(), admin_note = $2 WHERE id = $3`,
      [adminId, note, withdrawalId]
    );

    // Refund balance
    await client.query('COMMIT');
    await updateBalance(wd.user_id, parseFloat(wd.amount), 'withdrawal_refund', `Withdrawal #${withdrawalId} rejected`, withdrawalId, 'withdrawal', adminId);
    return wd;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function addTreasuryTransaction({ type, amount, note, txHash, adminId }) {
  const tb = parseFloat(await getSetting('treasury_balance', '0')) || 0;
  const delta = type === 'out' ? -Math.abs(amount) : Math.abs(amount);
  const newTb = tb + delta;
  await pool.query(
    `INSERT INTO treasury_logs (type, amount, balance_after, note, tx_hash, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [type, delta, newTb, note, txHash || null, adminId]
  );
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('treasury_balance', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [String(newTb)]
  );
  // Also log in main transactions for balancing
  await pool.query(
    `INSERT INTO transactions (user_id, type, amount, note, created_by)
     VALUES (NULL, $1, $2, $3, $4)`,
    [type === 'out' ? 'treasury_out' : 'treasury_in', delta, note, adminId]
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
