const { getSetting } = require('./settingsService');
const config = require('../config');

/** Popular symbols → CoinGecko ids */
const COINGECKO = {
  USDT: 'tether',
  USDC: 'usd-coin',
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  TON: 'the-open-network',
  TRX: 'tron',
  MATIC: 'matic-network',
  POL: 'matic-network',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  XRP: 'ripple',
};

/** Suggested networks per coin for admin UX */
const NETWORK_PRESETS = {
  USDT: ['TRC20', 'BEP20', 'ERC20', 'SOL', 'TON'],
  USDC: ['ERC20', 'BEP20', 'SOL'],
  BTC: ['BTC', 'BEP20'],
  ETH: ['ERC20', 'BEP20'],
  BNB: ['BEP20'],
  SOL: ['SOL'],
  TON: ['TON'],
  TRX: ['TRC20'],
  LTC: ['LTC'],
};

let cache = { at: 0, prices: {} };

async function fetchLiveUsdPrices(symbols = []) {
  const now = Date.now();
  if (now - cache.at < 45_000 && Object.keys(cache.prices).length) {
    return { ...cache.prices };
  }
  const list = symbols.length ? symbols : Object.keys(COINGECKO);
  const ids = [...new Set(list.map((s) => COINGECKO[String(s).toUpperCase()]).filter(Boolean))];
  try {
    if (ids.length) {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        const prices = { ...cache.prices };
        for (const [sym, id] of Object.entries(COINGECKO)) {
          if (data[id]?.usd != null) prices[sym] = Number(data[id].usd);
        }
        prices.USDT = prices.USDT ?? 1;
        prices.USDC = prices.USDC ?? 1;
        cache = { at: now, prices };
        return { ...prices };
      }
    }
  } catch (_) {}
  if (!Object.keys(cache.prices).length) {
    return {
      USDT: 1,
      USDC: 1,
      BTC: 95000,
      ETH: 3500,
      BNB: 600,
      SOL: 180,
      TON: 5.5,
      TRX: 0.15,
      MATIC: 0.5,
      POL: 0.5,
      LTC: 90,
      DOGE: 0.15,
      XRP: 0.6,
    };
  }
  return { ...cache.prices };
}

function round(n, d = 6) {
  const f = 10 ** d;
  return Math.round(Number(n) * f) / f;
}

function decimalsFor(currency) {
  const c = (currency || 'USDT').toUpperCase();
  if (['BTC'].includes(c)) return 8;
  if (['ETH', 'BNB', 'SOL', 'LTC'].includes(c)) return 6;
  if (['TRX', 'TON', 'MATIC', 'POL', 'DOGE', 'XRP'].includes(c)) return 4;
  return 4; // stables
}

/**
 * Ideal deposit quote
 * User wants `creditUsd` credited to platform balance (USDT).
 * They send crypto covering credit + platform fee.
 *
 * payUsd = creditUsd + fee
 * cryptoToSend = payUsd / rate
 */
async function quoteDeposit({ currency, network, usdAmount, addressRow }) {
  const cur = (currency || addressRow?.currency || 'USDT').toUpperCase();
  const prices = await fetchLiveUsdPrices([cur, 'USDT']);
  const adminRate = addressRow?.rate_usd != null && addressRow.rate_usd !== ''
    ? parseFloat(addressRow.rate_usd)
    : null;
  const price = (Number.isFinite(adminRate) && adminRate > 0 ? adminRate : prices[cur]) || 1;
  const feePct = parseFloat(addressRow?.fee_percent) || 0;
  const minUsd = parseFloat(addressRow?.min_amount) || config.minDeposit || 1;
  const creditUsd = parseFloat(usdAmount);

  if (!Number.isFinite(creditUsd) || creditUsd <= 0) throw new Error('Enter a valid USDT credit amount');
  if (creditUsd < minUsd) throw new Error(`Minimum deposit credit is $${minUsd.toFixed(2)}`);

  const feeUsd = round(creditUsd * (feePct / 100), 6);
  const payUsd = round(creditUsd + feeUsd, 6);
  const dec = decimalsFor(cur);
  const cryptoToSend = price > 0 ? round(payUsd / price, dec) : payUsd;

  return {
    currency: cur,
    network: network || addressRow?.network || '—',
    address: addressRow?.address || null,
    label: addressRow?.label || null,
    priceUsd: price,
    rateSource: adminRate ? 'admin' : 'market',
    minUsd,
    feePercent: feePct,
    feeUsd,
    creditUsd: round(creditUsd, 6),
    payUsd,
    cryptoAmount: cryptoToSend,
    cryptoToSend,
    // aliases used by older handlers
    desiredCreditUsd: round(creditUsd, 6),
  };
}

/**
 * Withdraw quote: user burns `requestUsd` from balance.
 * Net paid on-chain ≈ request - fee (admin still pays manually).
 */
async function quoteWithdraw({ currency, network, usdAmount, addressRow }) {
  const cur = (currency || addressRow?.currency || 'USDT').toUpperCase();
  const prices = await fetchLiveUsdPrices([cur]);
  const adminRate = addressRow?.rate_usd != null && addressRow.rate_usd !== ''
    ? parseFloat(addressRow.rate_usd)
    : null;
  const price = (Number.isFinite(adminRate) && adminRate > 0 ? adminRate : prices[cur]) || 1;
  const feePct = parseFloat(addressRow?.fee_percent) || 0;
  const minUsd =
    parseFloat(addressRow?.min_amount) ||
    parseFloat(await getSetting('min_withdraw', String(config.minWithdraw))) ||
    config.minWithdraw;

  const requestUsd = parseFloat(usdAmount);
  if (!Number.isFinite(requestUsd) || requestUsd <= 0) throw new Error('Invalid amount');
  if (requestUsd < minUsd) throw new Error(`Minimum withdrawal is $${minUsd}`);

  const feeUsd = round(requestUsd * (feePct / 100), 6);
  const netUsd = round(requestUsd - feeUsd, 6);
  if (netUsd <= 0) throw new Error('Amount too small after fees');
  const dec = decimalsFor(cur);
  const cryptoAmount = price > 0 ? round(netUsd / price, dec) : netUsd;

  return {
    currency: cur,
    network: network || addressRow?.network || '—',
    priceUsd: price,
    rateSource: adminRate ? 'admin' : 'market',
    minUsd,
    feePercent: feePct,
    feeUsd,
    requestUsd: round(requestUsd, 6),
    netUsd,
    cryptoAmount,
  };
}

function formatQuoteLines(q, kind = 'deposit') {
  if (kind === 'deposit') {
    return [
      `*You receive:* $${q.creditUsd} USDT credit`,
      `*Platform fee:* ${q.feePercent}% ($${q.feeUsd})`,
      `*You pay:* ≈ $${q.payUsd} value`,
      `*Send:* *${q.cryptoAmount} ${q.currency}* on *${q.network}*`,
      `*Rate:* $${q.priceUsd} / ${q.currency} (${q.rateSource})`,
      `*Min credit:* $${q.minUsd}`,
    ];
  }
  return [
    `*From balance:* $${q.requestUsd}`,
    `*Fee:* ${q.feePercent}% ($${q.feeUsd})`,
    `*You receive ≈* ${q.cryptoAmount} ${q.currency} ($${q.netUsd})`,
    `*Network:* ${q.network}`,
    `*Rate:* $${q.priceUsd} (${q.rateSource})`,
  ];
}

module.exports = {
  fetchLiveUsdPrices,
  quoteDeposit,
  quoteWithdraw,
  formatQuoteLines,
  COINGECKO,
  NETWORK_PRESETS,
  decimalsFor,
};
