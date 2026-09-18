/**
 * NovaSuite – shared PostgreSQL schema
 * Run once against the Railway (or any) Postgres instance.
 * Used by both the Telegraf bot and the Next.js Admin CMS.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      }
    : {
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'novasuite',
      }
);

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id                BIGSERIAL PRIMARY KEY,
  telegram_id       BIGINT UNIQUE NOT NULL,
  username          VARCHAR(255),
  first_name        VARCHAR(255),
  last_name         VARCHAR(255),
  language_code     VARCHAR(10) DEFAULT 'en',
  balance           NUMERIC(18, 8) DEFAULT 0 NOT NULL,
  total_earned      NUMERIC(18, 8) DEFAULT 0 NOT NULL,
  total_withdrawn   NUMERIC(18, 8) DEFAULT 0 NOT NULL,
  referral_code     VARCHAR(32) UNIQUE,
  referred_by       BIGINT REFERENCES users(telegram_id),
  is_banned         BOOLEAN DEFAULT FALSE,
  ban_reason        TEXT,
  is_admin          BOOLEAN DEFAULT FALSE,
  last_active_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

CREATE TABLE IF NOT EXISTS settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_addresses (
  id          SERIAL PRIMARY KEY,
  network     VARCHAR(50) NOT NULL,
  currency    VARCHAR(20) DEFAULT 'USDT',
  address     VARCHAR(255) NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  label       VARCHAR(100),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deposits (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(telegram_id),
  amount          NUMERIC(18, 8) NOT NULL,
  network         VARCHAR(50),
  tx_hash         VARCHAR(255),
  proof_url       TEXT,
  status          VARCHAR(20) DEFAULT 'pending',
  admin_note      TEXT,
  processed_by    BIGINT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);

CREATE TABLE IF NOT EXISTS withdrawals (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(telegram_id),
  amount          NUMERIC(18, 8) NOT NULL,
  network         VARCHAR(50),
  address         VARCHAR(255) NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending',
  admin_note      TEXT,
  tx_hash         VARCHAR(255),
  processed_by    BIGINT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

CREATE TABLE IF NOT EXISTS ads (
  id              SERIAL PRIMARY KEY,
  owner_id        BIGINT NOT NULL REFERENCES users(telegram_id),
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  url             TEXT NOT NULL,
  type            VARCHAR(30) DEFAULT 'website',
  reward          NUMERIC(18, 8) NOT NULL,
  budget          NUMERIC(18, 8) NOT NULL,
  spent           NUMERIC(18, 8) DEFAULT 0,
  views_done      INT DEFAULT 0,
  max_views       INT,
  duration_sec    INT DEFAULT 15,
  status          VARCHAR(20) DEFAULT 'pending',
  admin_note      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ads_owner ON ads(owner_id);
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);

CREATE TABLE IF NOT EXISTS ad_views (
  id              SERIAL PRIMARY KEY,
  ad_id           INT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(telegram_id),
  reward          NUMERIC(18, 8) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ad_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ad_views_user ON ad_views(user_id);

CREATE TABLE IF NOT EXISTS referrals (
  id              SERIAL PRIMARY KEY,
  referrer_id     BIGINT NOT NULL REFERENCES users(telegram_id),
  referred_id     BIGINT NOT NULL REFERENCES users(telegram_id) UNIQUE,
  bonus_paid      NUMERIC(18, 8) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT REFERENCES users(telegram_id),
  type            VARCHAR(50) NOT NULL,
  amount          NUMERIC(18, 8) NOT NULL,
  balance_after   NUMERIC(18, 8),
  reference_id    INT,
  reference_type  VARCHAR(50),
  note            TEXT,
  created_by      BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

CREATE TABLE IF NOT EXISTS treasury_logs (
  id              SERIAL PRIMARY KEY,
  type            VARCHAR(30) NOT NULL,
  amount          NUMERIC(18, 8) NOT NULL,
  balance_after   NUMERIC(18, 8),
  note            TEXT,
  tx_hash         VARCHAR(255),
  created_by      BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ideas (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(telegram_id),
  title           VARCHAR(200),
  content         TEXT NOT NULL,
  status          VARCHAR(20) DEFAULT 'new',
  admin_reply     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(telegram_id),
  subject         VARCHAR(200),
  message         TEXT NOT NULL,
  status          VARCHAR(20) DEFAULT 'open',
  admin_reply     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id              SERIAL PRIMARY KEY,
  actor_id        BIGINT,
  actor_type      VARCHAR(20) DEFAULT 'user',
  action          VARCHAR(100) NOT NULL,
  target_type     VARCHAR(50),
  target_id       VARCHAR(100),
  details         JSONB,
  ip              VARCHAR(45),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

CREATE TABLE IF NOT EXISTS cms_admins (
  id              SERIAL PRIMARY KEY,
  username        VARCHAR(100) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(30) DEFAULT 'admin',
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(schema);

    const defaults = [
      ['min_withdraw', '5'],
      ['referral_bonus_percent', '10'],
      ['default_ad_reward', '0.01'],
      ['currency', 'USDT'],
      ['currency_symbol', '$'],
      ['trust_wallet_address', process.env.TRUST_WALLET_ADDRESS || ''],
      ['treasury_balance', '0'],
      ['platform_name', 'NovaSuite'],
      ['support_username', ''],
      ['terms_url', ''],
      ['privacy_url', ''],
      ['welcome_message', 'Welcome to NovaSuite! View ads, earn USDT, advertise your bots & channels.'],
    ];

    for (const [key, value] of defaults) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
    }

    await client.query('COMMIT');
    console.log('[NovaSuite] Database migration completed');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[NovaSuite] Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
