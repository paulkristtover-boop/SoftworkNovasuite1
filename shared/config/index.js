require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const parseAdminIds = (raw) => {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => Number(id))
    .filter((id) => !Number.isNaN(id));
};

const config = {
  // Single bot: users + admin notifications
  botToken: process.env.BOT_TOKEN || process.env.USER_BOT_TOKEN,
  adminIds: parseAdminIds(process.env.ADMIN_IDS),

  cms: {
    password: process.env.ADMIN_CMS_PASSWORD || 'change-me-strong-password',
    secret: process.env.ADMIN_CMS_SECRET || 'cms-session-secret-change-me',
    url: process.env.ADMIN_CMS_URL || '',
  },

  webhook: {
    domain: process.env.WEBHOOK_DOMAIN || '',
    path: process.env.WEBHOOK_PATH || '/telegram-webhook',
    port: Number(process.env.PORT) || 3000,
    useWebhook: process.env.USE_WEBHOOK === 'true',
  },

  db: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'softwork_nova_suite',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },

  app: {
    env: process.env.NODE_ENV || 'production',
    currency: process.env.CURRENCY || 'USDT',
    minDeposit: Number(process.env.MIN_DEPOSIT) || 5,
    minWithdrawal: Number(process.env.MIN_WITHDRAWAL) || 10,
    supportUsername: process.env.SUPPORT_USERNAME || '@Support',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
    termsUrl: process.env.TERMS_URL || '',
    privacyUrl: process.env.PRIVACY_URL || '',
    trustWalletLabel: process.env.TRUST_WALLET_LABEL || 'SoftworkNovaSuite Trust Wallet',
  },

  ptc: {
    defaultReward: Number(process.env.PTC_DEFAULT_REWARD) || 0.001,
    minBudget: Number(process.env.PTC_MIN_BUDGET) || 1,
    minReward: Number(process.env.PTC_MIN_REWARD) || 0.0005,
    maxReward: Number(process.env.PTC_MAX_REWARD) || 0.05,
  },
};

// Aliases for notify service
config.userBotToken = config.botToken;
config.adminBotToken = config.botToken;

if (!config.botToken) {
  console.warn('[config] BOT_TOKEN is missing');
}

module.exports = config;
