const pool = require('../database/pool');
const config = require('../config');
const { ValidationError, NotFoundError, InsufficientBalanceError } = require('../utils/errors');
const { adjustBalance } = require('./users');
const { logAudit } = require('./audit');
const { debitTrust } = require('./treasury');

async function createWithdrawal({ userId, amount, network, toAddress }) {
  const amt = Number(amount);
  if (!amt || amt < config.app.minWithdrawal) {
    throw new ValidationError(`Minimum withdrawal is ${config.app.minWithdrawal} ${config.app.currency}.`);
  }
  if (!network) throw new ValidationError('Network is required (e.g. TRC20, ERC20, BEP20).');
  if (!toAddress || String(toAddress).trim().length < 10) {
    throw new ValidationError('Please provide a valid wallet address.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock user row and check balance
    const { rows: urows } = await client.query(
      `SELECT * FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    const user = urows[0];
    if (!user) throw new NotFoundError('User not found.');
    if (Number(user.balance) < amt) throw new InsufficientBalanceError();

    await adjustBalance(client, userId, -amt);

    const { rows } = await client.query(
      `INSERT INTO withdrawals (user_id, amount, currency, network, to_address, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [userId, amt, config.app.currency, network, String(toAddress).trim()]
    );

    await client.query('COMMIT');

    await logAudit({
      actorUserId: userId,
      action: 'withdrawal.create',
      entityType: 'withdrawal',
      entityId: rows[0].id,
      details: { amount: amt, network, toAddress: String(toAddress).slice(0, 12) + '…' },
    });

    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getWithdrawal(id) {
  const { rows } = await pool.query(
    `SELECT w.*, u.telegram_id, u.username, u.first_name, u.last_name, u.balance AS user_balance
     FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE w.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function listUserWithdrawals(userId, limit = 10) {
  const { rows } = await pool.query(
    `SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function listPendingWithdrawals(limit = 20) {
  const { rows } = await pool.query(
    `SELECT w.*, u.telegram_id, u.username, u.first_name, u.last_name
     FROM withdrawals w JOIN users u ON u.id = w.user_id
     WHERE w.status = 'pending' ORDER BY w.created_at ASC LIMIT $1`,
    [limit]
  );
  return rows;
}

/**
 * Admin approves and marks as paid after manually sending USDT from Trust Wallet.
 * Debits trust wallet balance for accounting.
 */
async function approveAndPayWithdrawal(withdrawalId, adminUserId, note) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE`,
      [withdrawalId]
    );
    const w = rows[0];
    if (!w) throw new NotFoundError('Withdrawal not found.');
    if (w.status !== 'pending') throw new ValidationError(`Withdrawal is already ${w.status}.`);

    await client.query(
      `UPDATE withdrawals SET status = 'paid', admin_note = $1, reviewed_by = $2,
       reviewed_at = NOW(), paid_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [note || null, adminUserId, withdrawalId]
    );

    await debitTrust(client, Number(w.amount), {
      type: 'withdrawal_debit',
      referenceType: 'withdrawal',
      referenceId: withdrawalId,
      note: `Withdrawal paid ${withdrawalId}`,
      createdBy: adminUserId,
    });

    await client.query('COMMIT');

    await logAudit({
      actorUserId: adminUserId,
      action: 'withdrawal.pay',
      entityType: 'withdrawal',
      entityId: withdrawalId,
      details: { amount: w.amount, userId: w.user_id },
    });

    return getWithdrawal(withdrawalId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function rejectWithdrawal(withdrawalId, adminUserId, note) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE`,
      [withdrawalId]
    );
    const w = rows[0];
    if (!w) throw new NotFoundError('Withdrawal not found.');
    if (w.status !== 'pending') throw new ValidationError(`Withdrawal is already ${w.status}.`);

    await client.query(
      `UPDATE withdrawals SET status = 'rejected', admin_note = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [note || null, adminUserId, withdrawalId]
    );

    // Refund user balance
    await adjustBalance(client, w.user_id, Number(w.amount));

    await client.query('COMMIT');

    await logAudit({
      actorUserId: adminUserId,
      action: 'withdrawal.reject',
      entityType: 'withdrawal',
      entityId: withdrawalId,
      details: { note },
    });

    return getWithdrawal(withdrawalId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  createWithdrawal,
  getWithdrawal,
  listUserWithdrawals,
  listPendingWithdrawals,
  approveAndPayWithdrawal,
  rejectWithdrawal,
};
