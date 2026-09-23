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
  label           VARCHAR(255) NOT NULL DEFAULT 'SoftworkNovaSuite Trust Wallet',
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
SELECT 'SoftworkNovaSuite Trust Wallet', 0, 'USDT'
WHERE NOT EXISTS (SELECT 1 FROM trust_wallet LIMIT 1);

-- ═══════════════════════════════════════════
-- SoftworkNovaSuite PTC: ads & earnings
-- ═══════════════════════════════════════════

-- Campaigns (users advertise bots, websites, channels, etc.)
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advertiser_id   BIGINT NOT NULL REFERENCES users(id),
  ad_type         VARCHAR(32) NOT NULL, -- bot | website | channel | group | other
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  target_url      TEXT NOT NULL,         -- t.me link, website URL, etc.
  reward_per_view NUMERIC(18, 8) NOT NULL DEFAULT 0.001, -- USDT paid to viewer
  budget_total    NUMERIC(18, 8) NOT NULL CHECK (budget_total > 0),
  budget_spent    NUMERIC(18, 8) NOT NULL DEFAULT 0,
  status          VARCHAR(32) NOT NULL DEFAULT 'pending',
  -- pending | active | paused | rejected | finished
  admin_note      TEXT,
  views_count     INTEGER NOT NULL DEFAULT 0,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_advertiser ON ad_campaigns(advertiser_id);

-- One earning event per user per campaign (prevents abuse)
CREATE TABLE IF NOT EXISTS ad_views (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id     UUID NOT NULL REFERENCES ad_campaigns(id),
  viewer_id       BIGINT NOT NULL REFERENCES users(id),
  reward          NUMERIC(18, 8) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_views_viewer ON ad_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_ad_views_campaign ON ad_views(campaign_id);

-- Platform PTC settings (single row style)
CREATE TABLE IF NOT EXISTS ptc_settings (
  id                    SERIAL PRIMARY KEY,
  default_reward        NUMERIC(18, 8) NOT NULL DEFAULT 0.001,
  min_campaign_budget   NUMERIC(18, 8) NOT NULL DEFAULT 1,
  min_reward_per_view   NUMERIC(18, 8) NOT NULL DEFAULT 0.0005,
  max_reward_per_view   NUMERIC(18, 8) NOT NULL DEFAULT 0.05,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ptc_settings (default_reward, min_campaign_budget)
SELECT 0.001, 1
WHERE NOT EXISTS (SELECT 1 FROM ptc_settings LIMIT 1);

-- ═══════════════════════════════════════════
-- Referrals, levels, daily bonus, anti-abuse
-- ═══════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(16) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by BIGINT REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_earned NUMERIC(18, 8) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_views INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_checkin_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS checkin_streak INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id     BIGINT NOT NULL REFERENCES users(id),
  referred_id     BIGINT NOT NULL REFERENCES users(id),
  reward_type     VARCHAR(32) NOT NULL, -- signup | earn_share | deposit_share
  amount          NUMERIC(18, 8) NOT NULL,
  reference_id    VARCHAR(64),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_id);

CREATE TABLE IF NOT EXISTS daily_bonuses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         BIGINT NOT NULL REFERENCES users(id),
  amount          NUMERIC(18, 8) NOT NULL,
  streak          INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_bonuses_user ON daily_bonuses(user_id);

-- Extend ptc_settings with competitive knobs
ALTER TABLE ptc_settings ADD COLUMN IF NOT EXISTS referral_signup_bonus NUMERIC(18, 8) DEFAULT 0.05;
ALTER TABLE ptc_settings ADD COLUMN IF NOT EXISTS referral_earn_percent NUMERIC(8, 4) DEFAULT 5;
ALTER TABLE ptc_settings ADD COLUMN IF NOT EXISTS daily_view_limit INTEGER DEFAULT 50;
ALTER TABLE ptc_settings ADD COLUMN IF NOT EXISTS claim_delay_seconds INTEGER DEFAULT 15;
ALTER TABLE ptc_settings ADD COLUMN IF NOT EXISTS daily_checkin_base NUMERIC(18, 8) DEFAULT 0.01;
ALTER TABLE ptc_settings ADD COLUMN IF NOT EXISTS daily_checkin_streak_bonus NUMERIC(18, 8) DEFAULT 0.002;

-- Pending claims: user opened ad, must wait timer before claim
CREATE TABLE IF NOT EXISTS ad_claim_sessions (
  viewer_id       BIGINT NOT NULL REFERENCES users(id),
  campaign_id     UUID NOT NULL REFERENCES ad_campaigns(id),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (viewer_id, campaign_id)
);


-- Safe upgrades for existing databases (CREATE TABLE IF NOT EXISTS skips new columns)
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance NUMERIC(18, 8) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_terms BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(16);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_earned NUMERIC(18, 8) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_views INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_checkin_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS checkin_streak INTEGER NOT NULL DEFAULT 0;

-- Unique index on referral_code if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'users_referral_code_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_referral_code'
  ) THEN
    CREATE UNIQUE INDEX idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;
  END IF;
END $$;

ALTER TABLE ptc_settings ADD COLUMN IF NOT EXISTS referral_welcome_bonus NUMERIC(18, 8) DEFAULT 0.02;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS estimated_views INTEGER;
