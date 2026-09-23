require('dotenv').config();

function num(v, d) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
}
function int(v, d) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}

module.exports = {
  botToken: process.env.BOT_TOKEN,
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),
  databaseUrl: process.env.DATABASE_URL,
  adminCmsUrl: process.env.ADMIN_CMS_URL || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  useWebhook: process.env.USE_WEBHOOK === 'true',
  webhookUrl: process.env.WEBHOOK_URL || '',
  webhookPath: process.env.WEBHOOK_PATH || '/webhook/telegram',
  port: int(process.env.PORT || process.env.BOT_PORT, 3001),

  currency: process.env.CURRENCY || 'USDT',
  currencySymbol: process.env.CURRENCY_SYMBOL || '$',
  minWithdraw: num(process.env.MIN_WITHDRAW, 5),
  minDeposit: num(process.env.MIN_DEPOSIT, 1),
  referralBonusPercent: num(process.env.REFERRAL_BONUS_PERCENT, 10),
  welcomeBonusAmount: num(process.env.WELCOME_BONUS_AMOUNT, 0.5),
  welcomeBonusLimit: int(process.env.WELCOME_BONUS_LIMIT, 30),
  channelUrl: process.env.CHANNEL_URL || 'https://t.me/SoftworkNovaSuite',
  groupUrl: process.env.GROUP_URL || 'https://t.me/softworknovasuitecommunity',
  /** @username or -100id — bot must be admin in channel/group to verify */
  channelUsername: process.env.CHANNEL_USERNAME || '@SoftworkNovaSuite',
  groupUsername: process.env.GROUP_USERNAME || '@softworknovasuitecommunity',
  requireMembership: process.env.REQUIRE_MEMBERSHIP !== 'false', // default ON — must join channel+group
  defaultAdReward: num(process.env.DEFAULT_AD_REWARD, 0.01),
  maxAdsPerUser: int(process.env.MAX_ADS_PER_USER, 20),
  adViewDurationSec: int(process.env.AD_VIEW_DURATION_SEC, 15),
  adViewCooldownSec: int(process.env.AD_VIEW_COOLDOWN_SEC, 60),
  maxDailyAdViews: int(process.env.MAX_DAILY_AD_VIEWS, 50),
  maxDailyEarn: num(process.env.MAX_DAILY_EARN, 10),
  minAdReward: num(process.env.MIN_AD_REWARD, 0.005),
  adPlatformFeePercent: num(process.env.AD_PLATFORM_FEE_PERCENT, 5),
  maxAdReward: num(process.env.MAX_AD_REWARD, 1),

  rateLimitWindowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 3000),
  rateLimitMax: int(process.env.RATE_LIMIT_MAX, 8),
  sessionTtlHours: int(process.env.SESSION_TTL_HOURS, 24),

  supportUsername: process.env.SUPPORT_USERNAME || '',
  supportEmail: process.env.SUPPORT_EMAIL || '',
  termsUrl: process.env.TERMS_URL || '',
  privacyUrl: process.env.PRIVACY_URL || '',
  platformName: process.env.PLATFORM_NAME || 'NovaSuite',
  trustWalletAddress: process.env.TRUST_WALLET_ADDRESS || '',
  defaultNetwork: process.env.DEFAULT_NETWORK || 'TRC20',
  logLevel: process.env.LOG_LEVEL || 'info',
  backupDir: process.env.BACKUP_DIR || './backups',
};
