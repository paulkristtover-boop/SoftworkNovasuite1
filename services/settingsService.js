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
    ? 'SELECT * FROM payment_addresses WHERE is_active=TRUE ORDER BY currency, network'
    : 'SELECT * FROM payment_addresses ORDER BY currency, network';
  return (await pool.query(q)).rows;
}

async function upsertPaymentAddress({
  network,
  currency,
  address,
  label,
  is_active,
  min_amount,
  fee_percent,
  rate_usd,
}) {
  // Prefer update by network+currency if exists
  const existing = await pool.query(
    `SELECT id FROM payment_addresses WHERE network=$1 AND currency=$2 LIMIT 1`,
    [network, currency || 'USDT']
  );
  if (existing.rows[0]) {
    const res = await pool.query(
      `UPDATE payment_addresses SET
         address=$1, label=$2, is_active=$3,
         min_amount=COALESCE($4, min_amount),
         fee_percent=COALESCE($5, fee_percent),
         rate_usd=$6,
         updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [
        address,
        label || null,
        is_active !== false,
        min_amount != null ? min_amount : null,
        fee_percent != null ? fee_percent : null,
        rate_usd != null && rate_usd !== '' ? rate_usd : null,
        existing.rows[0].id,
      ]
    );
    return res.rows[0];
  }
  const res = await pool.query(
    `INSERT INTO payment_addresses
       (network, currency, address, label, is_active, min_amount, fee_percent, rate_usd)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,1),COALESCE($7,0),$8)
     RETURNING *`,
    [
      network,
      currency || 'USDT',
      address,
      label || null,
      is_active !== false,
      min_amount != null ? min_amount : 1,
      fee_percent != null ? fee_percent : 0,
      rate_usd != null && rate_usd !== '' ? rate_usd : null,
    ]
  );
  return res.rows[0];
}

async function deletePaymentAddress(id) {
  await pool.query('DELETE FROM payment_addresses WHERE id=$1', [id]);
}

module.exports = {
  getSetting,
  setSetting,
  getAllSettings,
  getPaymentAddresses,
  upsertPaymentAddress,
  deletePaymentAddress,
};
