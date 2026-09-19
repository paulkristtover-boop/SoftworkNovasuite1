const { pool } = require('../database');

async function getSetting(key, def = null) {
  const res = await pool.query('SELECT value FROM settings WHERE key=$1', [key]);
  return res.rows[0] ? res.rows[0].value : def;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [key, String(value)]
  );
}

async function getAllSettings() {
  const res = await pool.query('SELECT key, value FROM settings ORDER BY key');
  const o = {};
  for (const r of res.rows) o[r.key] = r.value;
  return o;
}

async function getPaymentAddresses(activeOnly = true) {
  const q = activeOnly
    ? 'SELECT * FROM payment_addresses WHERE is_active=TRUE ORDER BY network'
    : 'SELECT * FROM payment_addresses ORDER BY network';
  return (await pool.query(q)).rows;
}

async function upsertPaymentAddress({ network, currency, address, label, is_active }) {
  const res = await pool.query(
    `INSERT INTO payment_addresses (network, currency, address, label, is_active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [network, currency || 'USDT', address, label || null, is_active !== false]
  );
  return res.rows[0];
}

async function deletePaymentAddress(id) {
  await pool.query('DELETE FROM payment_addresses WHERE id=$1', [id]);
}

module.exports = { getSetting, setSetting, getAllSettings, getPaymentAddresses, upsertPaymentAddress, deletePaymentAddress };
