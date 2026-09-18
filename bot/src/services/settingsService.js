const { pool } = require('../database');

async function getSetting(key, defaultValue = null) {
  const res = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return res.rows[0] ? res.rows[0].value : defaultValue;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, String(value)]
  );
}

async function getAllSettings() {
  const res = await pool.query('SELECT key, value FROM settings ORDER BY key');
  const obj = {};
  for (const row of res.rows) obj[row.key] = row.value;
  return obj;
}

async function getPaymentAddresses(activeOnly = true) {
  const q = activeOnly
    ? 'SELECT * FROM payment_addresses WHERE is_active = TRUE ORDER BY network'
    : 'SELECT * FROM payment_addresses ORDER BY network';
  const res = await pool.query(q);
  return res.rows;
}

async function upsertPaymentAddress({ id, network, currency, address, label, is_active }) {
  if (id) {
    await pool.query(
      `UPDATE payment_addresses SET network=$1, currency=$2, address=$3, label=$4, is_active=$5, updated_at=NOW() WHERE id=$6`,
      [network, currency || 'USDT', address, label || null, is_active !== false, id]
    );
    return id;
  }
  const res = await pool.query(
    `INSERT INTO payment_addresses (network, currency, address, label, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [network, currency || 'USDT', address, label || null, is_active !== false]
  );
  return res.rows[0].id;
}

async function deletePaymentAddress(id) {
  await pool.query('DELETE FROM payment_addresses WHERE id = $1', [id]);
}

module.exports = {
  getSetting,
  setSetting,
  getAllSettings,
  getPaymentAddresses,
  upsertPaymentAddress,
  deletePaymentAddress,
};
