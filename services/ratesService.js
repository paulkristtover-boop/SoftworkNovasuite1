const { getSetting, setSetting } = require('./settingsService');
const { getPaymentAddresses } = require('./settingsService');
const config = require('../config');

/** Map popular symbols → CoinGecko ids */
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
  LTC: 'litecoin',
};

let cache = { at: 0, prices: {} };

async function fetchLiveUsdPrices(symbols) {
  const now = Date.now();
  if (now - cache.at < 60_000 && Object.keys(cache.prices).length) {
    return cache.prices;
  }
  const ids = [...new Set(symbols.map((s) => COINGECKO[s.toUpperCase()]).filter(Boolean))];
  if (!ids.length) return cache.prices;
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`rates ${res.status}`);
    const data = await res.json();
    const prices = { ...cache.prices };
    for (const [sym, id] of Object.entries(COINGECKO)) {
      if (data[id]?.usd != null) prices[sym] = data[id].usd;
    }
    // stablecoins default
    if (prices.USDT == null) prices.USDT = 1;
    if (prices.USDC == null) prices.USDC = 1;
    cache = { at: now, prices };
    return prices;
  } catch (e) {
    if (!Object.keys(cache.prices).length) {
      return { USDT: 1, USDC: 1, BTC: 60000, ETH: 3000, BNB: 500, SOL: 150, TON: 5, TRX: 0.12 };
    }
    return cache.prices;
  }
}

/**
 * Quote deposit: user wants `usdAmount` USDT credit.
 * Returns crypto to send, fee, min, etc.
 */
async function quoteDeposit({ currency, network, usdAmount, addressRow }) {
  const cur = (currency || addressRow?.currency || 'USDT').toUpperCase();
  const prices = await fetchLiveUsdPrices([cur, 'USDT']);
  const price = parseFloat(addressRow?.rate_usd) || prices[cur] || 1;
  const feePct = parseFloat(addressRow?.fee_percent) || 0;
  const minUsd = parseFloat(addressRow?.min_amount) || config.minDeposit || 1;
  const usd = parseFloat(usdAmount);
  if (!Number.isFinite(usd) || usd <= 0) throw new Error('Invalid amount');
  if (usd < minUsd) throw new Error(`Minimum deposit is $${minUsd.toFixed(2)} USDT value`);

  const feeUsd = Math.round(usd * (feePct / 100) * 1e6) / 1e6;
  const creditUsd = Math.round((usd - feeUsd) * 1e6) / 1e6; // what user gets in platform USDT
  // User sends crypto worth `usd` (gross) OR we ask them to send amount that after fee credits request
  // Simple model: user specifies desired platform credit; they pay credit + fee in crypto
  const payUsd = Math.round((usd + feeUsd) * 1e6) / 1e6;
  const cryptoAmount = price > 0 ? Math.round((payUsd / price) * 1e8) / 1e8 : payUsd;

  return {
    currency: cur,
    network: network || addressRow?.network,
    priceUsd: price,
    minUsd,
    feePercent: feePct,
    feeUsd,
    desiredCreditUsd: usd,
    payUsd,
    cryptoAmount,
    address: addressRow?.address,
    label: addressRow?.label,
  };
}

async function quoteWithdraw({ currency, network, usdAmount, addressRow }) {
  const cur = (currency || 'USDT').toUpperCase();
  const prices = await fetchLiveUsdPrices([cur]);
  const price = parseFloat(addressRow?.rate_usd) || prices[cur] || 1;
  const feePct = parseFloat(addressRow?.fee_percent) || 0;
  const minUsd = parseFloat(await getSetting('min_withdraw', String(config.minWithdraw))) || config.minWithdraw;
  const usd = parseFloat(usdAmount);
  if (!Number.isFinite(usd) || usd <= 0) throw new Error('Invalid amount');
  if (usd < minUsd) throw new Error(`Minimum withdrawal is $${minUsd}`);

  const feeUsd = Math.round(usd * (feePct / 100) * 1e6) / 1e6;
  const netUsd = Math.round((usd - feeUsd) * 1e6) / 1e6;
  const cryptoAmount = price > 0 ? Math.round((netUsd / price) * 1e8) / 1e8 : netUsd;

  return {
    currency: cur,
    network: network || addressRow?.network,
    priceUsd: price,
    minUsd,
    feePercent: feePct,
    feeUsd,
    requestUsd: usd,
    netUsd,
    cryptoAmount,
  };
}

module.exports = { fetchLiveUsdPrices, quoteDeposit, quoteWithdraw, COINGECKO };
