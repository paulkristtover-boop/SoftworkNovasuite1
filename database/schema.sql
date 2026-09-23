-- Trust Wallet Telegram Bot — PostgreSQL schema
-- Currency: USDT only. No Naira.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  telegram_id     BIGINT UNIQUE NOT NULL,
  username        VARCHAR(255),
  first_name      VARCHAR(255),
  last_name       VARCHAR(255),
  balance         NUMERIC(18, 8) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  is_banned       BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason      TEXT,
  accepted_terms  BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_terms_at TIMESTAMPTZ,
  role            VARCHAR(32) NOT NULL DEFAULT 'user', -- user | admin
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);

-- Payment addresses (admin-managed, no external API)
CREATE TABLE IF NOT EXISTS payment_addresses (
  id              SERIAL PRIMARY KEY,
  network         VARCHAR(64) NOT NULL,  -- e.g. TRC20, ERC20, BEP20
  currency        VARCHAR(16) NOT NULL DEFAULT 'USDT',
  address         TEXT NOT NULL,
  label           VARCHAR(255),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  instructions    TEXT,
  created_by      BIGINT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_addresses_active ON payment_addresses(is_active);

-- Deposits
CREATE TABLE IF NOT EXISTS deposits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         BIGINT NOT NULL REFERENCES users(id),
  amount          NUMERIC(18, 8) NOT NULL CHECK (amount > 0),
  currency        VARCHAR(16) NOT NULL DEFAULT 'USDT',
  network         VARCHAR(64),
  tx_hash         VARCHAR(255),
  payment_address_id INTEGER REFERENCES payment_addresses(id),
  status          VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled
  admin_note      TEXT,
  reviewed_by     BIGINT REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);

-- Withdrawals
CREATE TABLE IF NOT EXISTS withdrawals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         BIGINT NOT NULL REFERENCES users(id),
  amount          NUMERIC(18, 8) NOT NULL CHECK (amount > 0),
  currency        VARCHAR(16) NOT NULL DEFAULT 'USDT',
  network         VARCHAR(64) NOT NULL,
  to_address      TEXT NOT NULL,
  status          VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending | approved | rejected | paid | cancelled
  admin_note      TEXT,
  reviewed_by     BIGINT REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- Trust wallet / Treasury (accounting only — shows what admin can take)
CREATE TABLE IF NOT EXISTS trust_wallet (
  id              SERIAL PRIMARY KEY,
  label           VARCHAR(255) NOT NULL DEFAULT 'Main Trust Wallet',
  balance         NUMERIC(18, 8) NOT NULL DEFAULT 0,
  currency        VARCHAR(16) NOT NULL DEFAULT 'USDT',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin ledger transactions (for balancing when admin withdraws from trust wallet)
CREATE TABLE IF NOT EXISTS ledger_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type            VARCHAR(64) NOT NULL, -- deposit_credit | withdrawal_debit | admin_withdraw | admin_adjust | fee
  amount          NUMERIC(18, 8) NOT NULL,
  currency        VARCHAR(16) NOT NULL DEFAULT 'USDT',
  direction       VARCHAR(8) NOT NULL, -- in | out
  reference_type  VARCHAR(64), -- deposit | withdrawal | manual
  reference_id    UUID,
  note            TEXT,
  created_by      BIGINT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger_transactions(created_at DESC);

-- Ideas / feedback
CREATE TABLE IF NOT EXISTS ideas (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  content         TEXT NOT NULL,
  status          VARCHAR(32) NOT NULL DEFAULT 'new', -- new | reviewed | implemented | closed
  admin_reply     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ideas_user_id ON ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  actor_telegram_id BIGINT,
  actor_user_id   BIGINT REFERENCES users(id),
  action          VARCHAR(128) NOT NULL,
  entity_type     VARCHAR(64),
  entity_id       VARCHAR(64),
  details         JSONB,
  ip_hint         VARCHAR(64),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Support tickets (simple)
CREATE TABLE IF NOT EXISTS support_messages (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  message         TEXT NOT NULL,
  is_from_admin   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions / conversation state (lightweight)
CREATE TABLE IF NOT EXISTS user_sessions (
  telegram_id     BIGINT PRIMARY KEY,
  state           VARCHAR(64),
  data            JSONB DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default trust wallet row if empty
INSERT INTO trust_wallet (label, balance, currency)
SELECT 'Main Trust Wallet', 0, 'USDT'
WHERE NOT EXISTS (SELECT 1 FROM trust_wallet LIMIT 1);
