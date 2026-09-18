/**
 * Optional seed – sample payment address if none exist
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false }
    : { host: 'localhost', database: 'novasuite' }
);

async function seed() {
  const count = await pool.query('SELECT COUNT(*) FROM payment_addresses');
  if (parseInt(count.rows[0].count, 10) === 0) {
    await pool.query(
      `INSERT INTO payment_addresses (network, currency, address, label, is_active)
       VALUES ('TRC20', 'USDT', 'REPLACE_WITH_YOUR_TRUST_WALLET', 'Main TRC20', true)`
    );
    console.log('[NovaSuite] Sample address inserted – replace in CMS');
  }
  console.log('[NovaSuite] Seed done');
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
