const pool = require('./pool');
const config = require('../config');

async function seed() {
  const client = await pool.connect();
  try {
    // Ensure trust wallet exists
    await client.query(`
      INSERT INTO trust_wallet (label, balance, currency)
      SELECT $1, 0, 'USDT'
      WHERE NOT EXISTS (SELECT 1 FROM trust_wallet LIMIT 1)
    `, [config.app.trustWalletLabel]);

    // Example inactive payment address template (admin must set real ones)
    const existing = await client.query('SELECT COUNT(*)::int AS c FROM payment_addresses');
    if (existing.rows[0].c === 0) {
      await client.query(`
        INSERT INTO payment_addresses (network, currency, address, label, is_active, instructions)
        VALUES
          ('TRC20', 'USDT', 'REPLACE_WITH_YOUR_TRC20_ADDRESS', 'USDT TRC20 (Trust Wallet)', false, 'Send only USDT (TRC20). Min deposit applies.'),
          ('ERC20', 'USDT', 'REPLACE_WITH_YOUR_ERC20_ADDRESS', 'USDT ERC20 (Trust Wallet)', false, 'Send only USDT (ERC20). Network fees apply.'),
          ('BEP20', 'USDT', 'REPLACE_WITH_YOUR_BEP20_ADDRESS', 'USDT BEP20 (Trust Wallet)', false, 'Send only USDT (BEP20 / BSC).')
      `);
      console.log('[seed] Placeholder payment addresses created (inactive). Activate & edit via admin.');
    }

    console.log('[seed] Done.');
  } catch (err) {
    console.error('[seed] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
