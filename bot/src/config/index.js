require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
require('dotenv').config();

const config = {
  // Telegram
  botToken: process.env.BOT_TOKEN,
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number),
  adminCmsUrl: process.env.ADMIN_CMS_URL || '',

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // Runtime
  nodeEnv: process.env.NODE_ENV || 'development',
  useWebhook: process.env.USE_WEBHOOK === 'true',
  webhookUrl: process.env.WEBHOOK_URL || '',
  webhookPath: process.env.WEBHOOK_PATH || '/webhook/telegram',
  botPort: parseInt(process.env.BOT_PORT || process.env.PORT || '3001', 10),

  // Currency (USDT only)
  currency: process.env.CURRENCY || 'USDT',
  currencySymbol: process.env.CURRENCY_SYMBOL || '$',
  minWithdraw: parseFloat(process.env.MIN_WITHDRAW || '5'),
  minDeposit: parseFloat(process.env.MIN_DEPOSIT || '1'),
  referralBonusPercent: parseFloat(process.env.REFERRAL_BONUS_PERCENT || '10'),
  defaultAdReward: parseFloat(process.env.DEFAULT_AD_REWARD || '0.01'),
  maxAdsPerUser: parseInt(process.env.MAX_ADS_PER_USER || '20', 10),
  adViewCooldownSeconds: parseInt(process.env.AD_VIEW_COOLDOWN_SECONDS || '30', 10),

  // Anti-abuse
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3000', 10),
  rateLimitMaxHits: parseInt(process.env.RATE_LIMIT_MAX_HITS || '8', 10),
  banMessage:
    process.env.BAN_MESSAGE ||
    'Your account has been banned. Contact support if this is a mistake.',

  // Support & legal
  supportUsername: process.env.SUPPORT_USERNAME || '',
  supportEmail: process.env.SUPPORT_EMAIL || '',
  termsUrl: process.env.TERMS_URL || '',
  privacyUrl: process.env.PRIVACY_URL || '',
  platformName: process.env.PLATFORM_NAME || 'NovaSuite',

  // Trust wallet defaults (CMS can override via settings table)
  trustWalletAddress: process.env.TRUST_WALLET_ADDRESS || '',
  defaultNetwork: process.env.DEFAULT_NETWORK || 'TRC20',

  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = config;
