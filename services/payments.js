const pool = require('../database/pool');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { logAudit } = require('./audit');

async function listActiveAddresses() {
  const { rows } = await pool.query(
    `SELECT * FROM payment_addresses WHERE is_active = TRUE ORDER BY network, id`
  );
  return rows;
}

async function listAllAddresses() {
  const { rows } = await pool.query(
    `SELECT * FROM payment_addresses ORDER BY is_active DESC, network, id`
  );
  return rows;
}

async function getAddressById(id) {
  const { rows } = await pool.query('SELECT * FROM payment_addresses WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createAddress({ network, currency = 'USDT', address, label, instructions, isActive = true, createdBy }) {
  if (!network || !address) throw new ValidationError('Network and address are required.');
  const { rows } = await pool.query(
    `INSERT INTO payment_addresses (network, currency, address, label, instructions, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [network, currency, address.trim(), label || null, instructions || null, isActive, createdBy || null]
  );
  await logAudit({
    actorUserId: createdBy,
    action: 'payment_address.create',
    entityType: 'payment_address',
    entityId: rows[0].id,
    details: { network, address: address.slice(0, 12) + '…' },
  });
  return rows[0];
}

async function updateAddress(id, fields, actorUserId) {
  const allowed = ['network', 'currency', 'address', 'label', 'instructions', 'is_active'];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${i++}`);
      vals.push(fields[key]);
    }
  }
  if (!sets.length) throw new ValidationError('Nothing to update.');
  sets.push('updated_at = NOW()');
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE payment_addresses SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  if (!rows[0]) throw new NotFoundError('Payment address not found.');
  await logAudit({
    actorUserId: actorUserId,
    action: 'payment_address.update',
    entityType: 'payment_address',
    entityId: id,
    details: fields,
  });
  return rows[0];
}

async function deleteAddress(id, actorUserId) {
  const { rowCount } = await pool.query('DELETE FROM payment_addresses WHERE id = $1', [id]);
  if (!rowCount) throw new NotFoundError('Payment address not found.');
  await logAudit({
    actorUserId,
    action: 'payment_address.delete',
    entityType: 'payment_address',
    entityId: id,
  });
}

module.exports = {
  listActiveAddresses,
  listAllAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  deleteAddress,
};
