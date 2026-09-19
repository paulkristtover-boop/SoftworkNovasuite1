-- NovaSuite PTC schema (USDT only)
-- Idempotent: safe to re-run

CREATE TABLE IF NOT EXISTS users (
  id                BIGSERIAL PRIMARY KEY,
  telegram_id       BIGINT UNIQUE NOT NULL,
  username          VARCHAR(255),
  first_name        VARCHAR(255),
  last_name         VARCHAR(255),
  language_code     VARCHAR(10) DEFAULT 'en',
  balance           NUMERIC(18, 8) DEFAULT 0 NOT NULL CHECK (balance >= 0),
  total_earned      NUMERIC(18, 8) DEFAULT 0 NOT NULL,
  total_withdrawn   NUMERIC(18, 8) DEFAULT 0 NOT NULL,
  referral_code     VARCHAR(32) UNIQUE,
  referred_by       BIGINT,
  is_banned         BOOLEAN DEFAULT FALSE,
  ban_reason        TEXT,
  fraud_score       INT DEFAULT 0,
  last_active_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_referral ON users(referral_code);

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
  amount          NUMERIC(18, 8) NOT NULL CHECK (amount > 0),
  network         VARCHAR(50),
  tx_hash         VARCHAR(255),
  proof_url       TEXT,
  status          VARCHAR(20) DEFAULT 'pending',
  admin_note      TEXT,
  review_checklist JSONB DEFAULT '{}',
  idempotency_key VARCHAR(64) UNIQUE,
  processed_by    BIGINT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_tx_hash ON deposits(tx_hash) WHERE tx_hash IS NOT NULL AND tx_hash <> '';

CREATE TABLE IF NOT EXISTS withdrawals (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(telegram_id),
  amount          NUMERIC(18, 8) NOT NULL CHECK (amount > 0),
  network         VARCHAR(50),
  address         VARCHAR(255) NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending',
  admin_note      TEXT,
  tx_hash         VARCHAR(255),
  idempotency_key VARCHAR(64) UNIQUE,
  processed_by    BIGINT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

CREATE TABLE IF NOT EXISTS ads (
  id              SERIAL PRIMARY KEY,
  owner_id        BIGINT NOT NULL REFERENCES users(telegram_id),
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  url             TEXT NOT NULL,
  type            VARCHAR(30) DEFAULT 'website',
  reward          NUMERIC(18, 8) NOT NULL CHECK (reward > 0),
  budget          NUMERIC(18, 8) NOT NULL CHECK (budget > 0),
  spent           NUMERIC(18, 8) DEFAULT 0,
  views_done      INT DEFAULT 0,
  max_views       INT,
  duration_sec    INT DEFAULT 15,
  status          VARCHAR(20) DEFAULT 'pending',
  admin_note      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);

-- Campaign / task verification (anti-fraud)
CREATE TABLE IF NOT EXISTS ad_views (
  id              SERIAL PRIMARY KEY,
  ad_id           INT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(telegram_id),
  reward          NUMERIC(18, 8) NOT NULL,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  verified        BOOLEAN DEFAULT FALSE,
  client_token    VARCHAR(64),
  ip_hash         VARCHAR(64),
  status          VARCHAR(20) DEFAULT 'started',
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

-- Ledger with idempotency
CREATE TABLE IF NOT EXISTS transactions (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT REFERENCES users(telegram_id),
  type            VARCHAR(50) NOT NULL,
  amount          NUMERIC(18, 8) NOT NULL,
  balance_after   NUMERIC(18, 8),
  reference_id    INT,
  reference_type  VARCHAR(50),
  note            TEXT,
  idempotency_key VARCHAR(64) UNIQUE,
  created_by      BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);

CREATE TABLE IF NOT EXISTS treasury_logs (
  id              SERIAL PRIMARY KEY,
  type            VARCHAR(30) NOT NULL,
  amount          NUMERIC(18, 8) NOT NULL,
  balance_after   NUMERIC(18, 8),
  note            TEXT,
  tx_hash         VARCHAR(255),
  idempotency_key VARCHAR(64) UNIQUE,
  created_by      BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ideas (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(telegram_id),
  content         TEXT NOT NULL,
  status          VARCHAR(20) DEFAULT 'new',
  admin_reply     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(telegram_id),
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

-- Anti-fraud events
CREATE TABLE IF NOT EXISTS fraud_events (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT,
  event_type      VARCHAR(50) NOT NULL,
  severity        INT DEFAULT 1,
  details         JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- CMS sessions (server-side, stronger than cookie-only)
CREATE TABLE IF NOT EXISTS cms_sessions (
  id              VARCHAR(64) PRIMARY KEY,
  admin_label     VARCHAR(100),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  last_seen_at    TIMESTAMPTZ DEFAULT NOW(),
  ip              VARCHAR(45),
  user_agent      TEXT,
  revoked         BOOLEAN DEFAULT FALSE
);

-- Health / monitoring pings
CREATE TABLE IF NOT EXISTS health_checks (
  id              SERIAL PRIMARY KEY,
  service         VARCHAR(50) NOT NULL,
  status          VARCHAR(20) NOT NULL,
  detail          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
