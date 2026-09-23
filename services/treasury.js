const pool = require('../database/pool');
const { ValidationError } = require('../utils/errors');
const { logAudit } = require('./audit');

async function getTrustWallet() {
  const { rows } = await pool.query('SELECT * FROM trust_wallet ORDER BY id LIMIT 1');
  return rows[0] || null;
}

async function creditTrust(client, amount, { type, referenceType, referenceId, note, createdBy }) {
  const amt = Number(amount);
  if (!(amt > 0)) throw new ValidationError('Amount must be positive.');
  await client.query(
    `UPDATE trust_wallet SET balance = balance + $1, updated_at = NOW() WHERE id = (SELECT id FROM trust_wallet ORDER BY id LIMIT 1)`,
    [amt]
  );
  await client.query(
    `INSERT INTO ledger_transactions (type, amount, currency, direction, reference_type, reference_id, note, created_by)
     VALUES ($1, $2, 'USDT', 'in', $3, $4, $5, $6)`,
    [type, amt, referenceType || null, referenceId || null, note || null, createdBy || null]
  );
}

async function debitTrust(client, amount, { type, referenceType, referenceId, note, createdBy }) {
  const amt = Number(amount);
  if (!(amt > 0)) throw new ValidationError('Amount must be positive.');
  const { rows } = await client.query(
    `UPDATE trust_wallet SET balance = balance - $1, updated_at = NOW()
     WHERE id = (SELECT id FROM trust_wallet ORDER BY id LIMIT 1) AND balance >= $1
     RETURNING *`,
    [amt]
  );
  if (!rows[0]) {
    // Allow going negative for accounting visibility if needed — or strict:
    // throw new ValidationError('Trust wallet balance too low.');
    await client.query(
      `UPDATE trust_wallet SET balance = balance - $1, updated_at = NOW()
       WHERE id = (SELECT id FROM trust_wallet ORDER BY id LIMIT 1)`,
      [amt]
    );
  }
  await client.query(
    `INSERT INTO ledger_transactions (type, amount, currency, direction, reference_type, reference_id, note, created_by)
     VALUES ($1, $2, 'USDT', 'out', $3, $4, $5, $6)`,
    [type, amt, referenceType || null, referenceId || null, note || null, createdBy || null]
  );
}

/**
 * Admin records a withdrawal FROM the Trust Wallet (real funds leaving).
 * For accounts/balancing only — does not move crypto automatically.
 */
async function adminWithdrawFromTrust({ amount, note, adminUserId }) {
  const amt = Number(amount);
  if (!(amt > 0)) throw new ValidationError('Amount must be positive.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await debitTrust(client, amt, {
      type: 'admin_withdraw',
      referenceType: 'manual',
      note: note || 'Admin withdraw from Trust Wallet',
      createdBy: adminUserId,
    });
    await client.query('COMMIT');
    await logAudit({
      actorUserId: adminUserId,
      action: 'treasury.admin_withdraw',
      entityType: 'trust_wallet',
      details: { amount: amt, note },
    });
    return getTrustWallet();
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Manual ledger adjustment for balancing accounts.
 */
async function adminAdjust({ amount, direction, note, adminUserId }) {
  const amt = Math.abs(Number(amount));
  if (!(amt > 0)) throw new ValidationError('Amount must be positive.');
  if (!['in', 'out'].includes(direction)) throw new ValidationError('Direction must be in or out.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (direction === 'in') {
      await creditTrust(client, amt, {
        type: 'admin_adjust',
        referenceType: 'manual',
        note: note || 'Manual adjust in',
        createdBy: adminUserId,
      });
    } else {
      await debitTrust(client, amt, {
        type: 'admin_adjust',
        referenceType: 'manual',
        note: note || 'Manual adjust out',
        createdBy: adminUserId,
      });
    }
    await client.query('COMMIT');
    await logAudit({
      actorUserId: adminUserId,
      action: 'treasury.adjust',
      entityType: 'trust_wallet',
      details: { amount: amt, direction, note },
    });
    return getTrustWallet();
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function listLedger(limit = 30) {
  const { rows } = await pool.query(
    `SELECT * FROM ledger_transactions ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

module.exports = {
  getTrustWallet,
  creditTrust,
  debitTrust,
  adminWithdrawFromTrust,
  adminAdjust,
  listLedger,
};
