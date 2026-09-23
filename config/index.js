require('dotenv').config();

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
  botToken: process.env.BOT_TOKEN,
  adminIds: parseAdminIds(process.env.ADMIN_IDS),
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
    database: process.env.DB_NAME || 'trustwallet_bot',
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
    trustWalletLabel: process.env.TRUST_WALLET_LABEL || 'Main Trust Wallet',
  },
};

if (!config.botToken) {
  console.warn('[config] BOT_TOKEN is missing. Set it in .env');
}

module.exports = config;
