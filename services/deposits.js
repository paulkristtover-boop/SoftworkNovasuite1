const pool = require('../database/pool');
const config = require('../config');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { adjustBalance } = require('./users');
const { logAudit } = require('./audit');
const { creditTrust } = require('./treasury');

async function createDeposit({ userId, amount, network, txHash, paymentAddressId }) {
  const amt = Number(amount);
  if (!amt || amt < config.app.minDeposit) {
    throw new ValidationError(`Minimum deposit is ${config.app.minDeposit} ${config.app.currency}.`);
  }
  if (!txHash || String(txHash).trim().length < 8) {
    throw new ValidationError('Please provide a valid transaction hash / ID.');
  }

  const { rows } = await pool.query(
    `INSERT INTO deposits (user_id, amount, currency, network, tx_hash, payment_address_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
    [userId, amt, config.app.currency, network || null, String(txHash).trim(), paymentAddressId || null]
  );

  await logAudit({
    actorUserId: userId,
    action: 'deposit.create',
    entityType: 'deposit',
    entityId: rows[0].id,
    details: { amount: amt, network, txHash: String(txHash).slice(0, 16) },
  });

  return rows[0];
}

async function getDeposit(id) {
  const { rows } = await pool.query(
    `SELECT d.*, u.telegram_id, u.username, u.first_name, u.last_name, u.balance AS user_balance
     FROM deposits d JOIN users u ON u.id = d.user_id WHERE d.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function listUserDeposits(userId, limit = 10) {
  const { rows } = await pool.query(
    `SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function listPendingDeposits(limit = 20) {
  const { rows } = await pool.query(
    `SELECT d.*, u.telegram_id, u.username, u.first_name, u.last_name
     FROM deposits d JOIN users u ON u.id = d.user_id
     WHERE d.status = 'pending' ORDER BY d.created_at ASC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function approveDeposit(depositId, adminUserId, note) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM deposits WHERE id = $1 FOR UPDATE`,
      [depositId]
    );
    const dep = rows[0];
    if (!dep) throw new NotFoundError('Deposit not found.');
    if (dep.status !== 'pending') throw new ValidationError(`Deposit is already ${dep.status}.`);

    await client.query(
      `UPDATE deposits SET status = 'approved', admin_note = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [note || null, adminUserId, depositId]
    );

    await adjustBalance(client, dep.user_id, Number(dep.amount));
    await creditTrust(client, Number(dep.amount), {
      type: 'deposit_credit',
      referenceType: 'deposit',
      referenceId: depositId,
      note: `Deposit approved ${depositId}`,
      createdBy: adminUserId,
    });

    await client.query('COMMIT');

    await logAudit({
      actorUserId: adminUserId,
      action: 'deposit.approve',
      entityType: 'deposit',
      entityId: depositId,
      details: { amount: dep.amount, userId: dep.user_id },
    });

    return getDeposit(depositId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function rejectDeposit(depositId, adminUserId, note) {
  const { rows } = await pool.query(
    `UPDATE deposits SET status = 'rejected', admin_note = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $3 AND status = 'pending' RETURNING *`,
    [note || null, adminUserId, depositId]
  );
  if (!rows[0]) throw new ValidationError('Deposit not found or not pending.');
  await logAudit({
    actorUserId: adminUserId,
    action: 'deposit.reject',
    entityType: 'deposit',
    entityId: depositId,
    details: { note },
  });
  return getDeposit(depositId);
}

module.exports = {
  createDeposit,
  getDeposit,
  listUserDeposits,
  listPendingDeposits,
  approveDeposit,
  rejectDeposit,
};
