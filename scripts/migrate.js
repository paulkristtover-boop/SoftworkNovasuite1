require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../database');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '../postgres/schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    const defaults = [
      ['min_withdraw', process.env.MIN_WITHDRAW || '5'],
      ['referral_bonus_percent', process.env.REFERRAL_BONUS_PERCENT || '10'],
      ['default_ad_reward', process.env.DEFAULT_AD_REWARD || '0.01'],
      ['currency', 'USDT'],
      ['currency_symbol', '$'],
      ['trust_wallet_address', process.env.TRUST_WALLET_ADDRESS || ''],
      ['treasury_balance', '0'],
      ['platform_name', 'NovaSuite'],
      ['support_username', process.env.SUPPORT_USERNAME || ''],
      ['terms_url', process.env.TERMS_URL || ''],
      ['privacy_url', process.env.PRIVACY_URL || ''],
      ['welcome_message', 'Welcome to NovaSuite! View ads, earn USDT, advertise bots & channels.'],
      ['welcome_bonus_amount', process.env.WELCOME_BONUS_AMOUNT || '0.5'],
      ['welcome_bonus_limit', process.env.WELCOME_BONUS_LIMIT || '30'],
      ['channel_url', process.env.CHANNEL_URL || 'https://t.me/SoftworkNovaSuite'],
      ['group_url', process.env.GROUP_URL || 'https://t.me/softworknovasuitecommunity'],
    ];
    for (const [k, v] of defaults) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`,
        [k, v]
      );
    }
    await client.query('COMMIT');
    console.log('[NovaSuite] Migration OK');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[NovaSuite] Migration failed', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
