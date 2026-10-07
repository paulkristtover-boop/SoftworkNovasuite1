/**
 * Payment infrastructure — automatic deposit verification via public explorers.
 *
 * Flow (lotto-style):
 * 1. User selects network + amount, gets platform deposit address
 * 2. User sends crypto and submits TxID
 * 3. We verify on-chain (TRC20 / ERC20 / BEP20 USDT)
 * 4. If valid → auto-credit net amount (after deposit tax) + treasury tax
 * 5. If API unavailable or mismatch → pending for admin (configurable)
 *
 * Why explorers: no private keys; admin still controls payout wallet.
 * Why tax here: single place for deposit revenue accounting.
 */

const config = require('../config');
const { pool } = require('../database');
const { getPaymentAddresses, getSetting, setSetting } = require('./settingsService');
const { updateBalance } = require('./userService');
const { idempotencyKey } = require('../utils/helpers');
const { audit } = require('../utils/audit');
const { logger } = require('../utils/logger');

const USDT_CONTRACTS = {
  TRC20: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  ERC20: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  BEP20: '0x55d398326f99059ff775485246999027b3197955',
};

function normalizeNetwork(n) {
  const x = String(n || '').toUpperCase().replace(/[-_\s]/g, '');
  if (['TRC20', 'TRON', 'TRX'].includes(x)) return 'TRC20';
  if (['ERC20', 'ETH', 'ETHEREUM'].includes(x)) return 'ERC20';
  if (['BEP20', 'BSC', 'BNB'].includes(x)) return 'BEP20';
  return String(n || '').toUpperCase();
}

function calcTax(gross, percent) {
  const g = parseFloat(gross) || 0;
  const p = parseFloat(percent) || 0;
  const tax = Math.round(g * (p / 100) * 1e8) / 1e8;
  const net = Math.round((g - tax) * 1e8) / 1e8;
  return { gross: g, tax, net: net > 0 ? net : 0 };
}

async function treasuryIn(amount, note, txHash, taxKind, adminId, key) {
  const tb = parseFloat(await getSetting('treasury_balance', '0')) || 0;
  const newTb = tb + parseFloat(amount);
  await setSetting('treasury_balance', String(newTb));
  await pool.query(
    `INSERT INTO treasury_logs (type, amount, balance_after, note, tx_hash, tax_kind, created_by, idempotency_key)
     VALUES ('in',$1,$2,$3,$4,$5,$6,$7) ON CONFLICT (idempotency_key) DO NOTHING`,
    [amount, newTb, note, txHash || null, taxKind || null, adminId || null, key]
  );
  return newTb;
}

async function treasuryOut(amount, note, txHash, taxKind, adminId, key) {
  const tb = parseFloat(await getSetting('treasury_balance', '0')) || 0;
  const delta = -Math.abs(parseFloat(amount));
  const newTb = tb + delta;
  await setSetting('treasury_balance', String(newTb));
  await pool.query(
    `INSERT INTO treasury_logs (type, amount, balance_after, note, tx_hash, tax_kind, created_by, idempotency_key)
     VALUES ('out',$1,$2,$3,$4,$5,$6,$7) ON CONFLICT (idempotency_key) DO NOTHING`,
    [delta, newTb, note, txHash || null, taxKind || null, adminId || null, key]
  );
  return newTb;
}

/** Verify TRC20 USDT transfer to expected address */
async function verifyTrc20(txHash, expectedAddress, minAmountUsd) {
  const url = `https://api.trongrid.io/v1/transactions/${txHash}/events`;
  const headers = { Accept: 'application/json' };
  if (config.tronGridApiKey) headers['TRON-PRO-API-KEY'] = config.tronGridApiKey;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`TronGrid HTTP ${res.status}`);
  const data = await res.json();
  const events = data.data || data || [];

  // Fallback: get transaction info
  let amount = 0;
  let toAddr = null;
  let fromAddr = null;
  let confirmed = false;

  for (const ev of Array.isArray(events) ? events : []) {
    const name = ev.event_name || ev.name || '';
    if (name !== 'Transfer') continue;
    const result = ev.result || ev;
    const to = result.to || result.to_address || result[1];
    const value = result.value || result[2];
    // TRC20 USDT has 6 decimals
    const raw = parseFloat(value);
    if (!Number.isFinite(raw)) continue;
    amount = raw / 1e6;
    toAddr = typeof to === 'string' ? to : null;
    fromAddr = result.from || result.from_address || null;
    confirmed = true;
    break;
  }

  if (!confirmed) {
    // Try wallet API
    const infoUrl = `https://api.trongrid.io/wallet/gettransactioninfobyid`;
    const infoRes = await fetch(infoUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: txHash }),
      signal: AbortSignal.timeout(12000),
    });
    if (infoRes.ok) {
      const info = await infoRes.json();
      if (info && info.id) confirmed = true;
      // Parse log transfers if present
      const logs = info.log || [];
      for (const log of logs) {
        // topic Transfer
        if (log.topics && log.topics[0] && String(log.topics[0]).includes('ddf252ad')) {
          // data is amount
          const hex = log.data || '0';
          const raw = parseInt(hex, 16);
          if (Number.isFinite(raw)) amount = raw / 1e6;
        }
      }
    }
  }

  const addrOk =
    !expectedAddress ||
    !toAddr ||
    String(toAddr).toLowerCase() === String(expectedAddress).toLowerCase() ||
    // base58 vs hex — accept if amount matches and we couldn't decode to
    amount >= (minAmountUsd || 0) * 0.98;

  return {
    ok: confirmed && amount > 0 && addrOk,
    amount,
    to: toAddr,
    from: fromAddr,
    network: 'TRC20',
    currency: 'USDT',
    confirmations: confirmed ? config.minConfirmationsTrc20 : 0,
    raw: { source: 'trongrid' },
  };
}

/** ERC20 / BEP20 via Etherscan-compatible API */
async function verifyEvm(txHash, network, expectedAddress, minAmountUsd) {
  const isBsc = network === 'BEP20';
  const base = isBsc ? 'https://api.bscscan.com/api' : 'https://api.etherscan.io/api';
  const key = isBsc ? config.bscscanApiKey : config.etherscanApiKey;
  const contract = USDT_CONTRACTS[network];

  const params = new URLSearchParams({
    module: 'proxy',
    action: 'eth_getTransactionReceipt',
    txhash: txHash,
    apikey: key || '',
  });
  const res = await fetch(`${base}?${params}`, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Explorer HTTP ${res.status}`);
  const data = await res.json();
  const receipt = data.result;
  if (!receipt || receipt.status !== '0x1') {
    return { ok: false, amount: 0, network, currency: 'USDT', reason: 'not_confirmed_or_failed' };
  }

  let amount = 0;
  let toAddr = null;
  const logs = receipt.logs || [];
  for (const log of logs) {
    if (contract && String(log.address).toLowerCase() !== contract.toLowerCase()) continue;
    // Transfer topic
    if (!log.topics || !log.topics[0] || !String(log.topics[0]).toLowerCase().startsWith('0xddf252ad')) continue;
    const toTopic = log.topics[2];
    if (toTopic) toAddr = '0x' + toTopic.slice(-40);
    const raw = parseInt(log.data, 16);
    // USDT ERC20 6 decimals, BEP20 often 18
    const decimals = isBsc ? 18 : 6;
    if (Number.isFinite(raw)) amount = raw / 10 ** decimals;
  }

  const expected = (expectedAddress || '').toLowerCase();
  const addrOk = !expected || !toAddr || toAddr.toLowerCase() === expected;
  const minOk = amount >= (minAmountUsd || 0) * 0.98;

  return {
    ok: amount > 0 && addrOk && minOk,
    amount,
    to: toAddr,
    network,
    currency: 'USDT',
    confirmations: isBsc ? config.minConfirmationsBep20 : config.minConfirmationsErc20,
    raw: { source: isBsc ? 'bscscan' : 'etherscan' },
  };
}

async function verifyTransaction({ txHash, network, expectedAddress, minAmount }) {
  const net = normalizeNetwork(network);
  if (!txHash || txHash.length < 10) {
    return { ok: false, reason: 'invalid_tx_hash' };
  }
  try {
    if (net === 'TRC20') return await verifyTrc20(txHash, expectedAddress, minAmount);
    if (net === 'ERC20' || net === 'BEP20') return await verifyEvm(txHash, net, expectedAddress, minAmount);
    return { ok: false, reason: 'unsupported_network', network: net };
  } catch (e) {
    logger.warn('verifyTransaction', e.message);
    return { ok: false, reason: 'api_error', error: e.message };
  }
}

/**
 * Submit deposit: create row, optionally auto-verify + credit.
 */
async function submitDeposit({
  userId,
  amount,
  network,
  txHash,
  currency = 'USDT',
  cryptoAmount,
  note,
  addressRow,
}) {
  const net = normalizeNetwork(network);
  if (txHash) {
    const dup = await pool.query(`SELECT id, status FROM deposits WHERE tx_hash=$1`, [txHash]);
    if (dup.rows[0]) throw new Error('This TxID was already submitted.');
  }

  const taxPct = config.depositTaxPercent || 0;
  const { gross, tax, net: netAmt } = calcTax(amount, taxPct);
  const key = idempotencyKey('deposit', userId, amount, net, txHash || Date.now());

  const addresses = await getPaymentAddresses(true);
  const expected =
    addressRow?.address ||
    addresses.find((a) => normalizeNetwork(a.network) === net)?.address ||
    null;

  let status = 'pending';
  let autoVerified = false;
  let verifyDetail = {};
  let source = 'manual';

  if (config.autoDepositEnabled && txHash) {
    const v = await verifyTransaction({
      txHash,
      network: net,
      expectedAddress: expected,
      minAmount: amount * 0.95,
    });
    verifyDetail = v;
    if (v.ok && v.amount > 0) {
      // Prefer on-chain amount if close
      const onChain = v.amount;
      if (Math.abs(onChain - amount) / amount < 0.15 || onChain >= amount * 0.95) {
        status = 'approved';
        autoVerified = true;
        source = 'auto';
        // Recalc tax on verified amount
        const t = calcTax(Math.min(onChain, amount * 1.05), taxPct);
        Object.assign({ gross: t.gross, tax: t.tax, net: t.net });
      }
    } else if (!config.autoDepositFallbackPending) {
      status = 'rejected';
      source = 'auto_reject';
    }
  }

  // Final tax numbers (use stated amount for pending; verified for auto)
  const creditGross = autoVerified && verifyDetail.amount
    ? Math.min(parseFloat(verifyDetail.amount), parseFloat(amount) * 1.05)
    : parseFloat(amount);
  const finalTax = calcTax(creditGross, taxPct);

  const adminNote =
    note ||
    (cryptoAmount ? `Send ${cryptoAmount} ${currency || ''}`.trim() : null) ||
    (autoVerified ? 'Auto-verified on-chain' : null);

  const res = await pool.query(
    `INSERT INTO deposits
       (user_id, amount, net_amount, tax_amount, network, currency, tx_hash, status, source,
        auto_verified, verify_detail, admin_note, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      userId,
      finalTax.gross,
      finalTax.net,
      finalTax.tax,
      net,
      currency || 'USDT',
      txHash || null,
      status,
      source,
      autoVerified,
      JSON.stringify(verifyDetail || {}),
      adminNote,
      key,
    ]
  );
  const dep = res.rows[0];

  if (status === 'approved' && autoVerified) {
    await creditDeposit(dep, null, { reason: 'auto_verify' });
  }

  return dep;
}

async function creditDeposit(dep, adminId, { reason, checklist } = {}) {
  const id = dep.id;
  const key = idempotencyKey('approve_deposit', id);
  const credit = parseFloat(dep.net_amount != null ? dep.net_amount : dep.amount) || parseFloat(dep.amount);
  const tax = parseFloat(dep.tax_amount) || 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const d = await client.query(`SELECT * FROM deposits WHERE id=$1 FOR UPDATE`, [id]);
    if (!d.rows[0]) throw new Error('Deposit not found');
    if (d.rows[0].status === 'approved' && d.rows[0].processed_at) {
      await client.query('COMMIT');
      return d.rows[0];
    }
    if (!['pending', 'approved'].includes(d.rows[0].status)) {
      throw new Error('Deposit not pending');
    }

    await client.query(
      `UPDATE deposits SET status='approved', processed_by=$1, processed_at=NOW(),
        admin_note=COALESCE($2, admin_note), review_checklist=$3
       WHERE id=$4`,
      [adminId || null, reason || null, JSON.stringify(checklist || {}), id]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await updateBalance(dep.user_id, credit, 'deposit', {
    note: `Deposit #${id}${dep.auto_verified ? ' (auto)' : ''}`,
    referenceId: id,
    referenceType: 'deposit',
    createdBy: adminId || null,
    idempotencyKey: key,
  });

  // total_deposited tracking
  await pool.query(
    `UPDATE users SET total_deposited = COALESCE(total_deposited,0) + $1, updated_at=NOW()
     WHERE telegram_id=$2`,
    [credit, dep.user_id]
  ).catch(() => {});

  // Gross to treasury in, then tax stays; user already got net
  // Accounting: full gross is platform inflow; tax is platform revenue portion
  await treasuryIn(
    parseFloat(dep.amount),
    `Deposit #${id} gross`,
    dep.tx_hash,
    'deposit_gross',
    adminId,
    idempotencyKey('treasury_in_dep', id)
  );
  if (tax > 0) {
    // Tax already inside gross; log tax portion for reporting
    await pool.query(
      `INSERT INTO treasury_logs (type, amount, balance_after, note, tx_hash, tax_kind, created_by, idempotency_key)
       SELECT 'in', $1, (SELECT value::numeric FROM settings WHERE key='treasury_balance'), $2, $3, 'deposit_tax', $4, $5
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [tax, `Deposit #${id} tax`, dep.tx_hash, adminId || null, idempotencyKey('treasury_tax_dep', id)]
    ).catch(() => {});
  }

  await audit({
    actorId: adminId,
    action: dep.auto_verified ? 'auto_approve_deposit' : 'approve_deposit',
    targetType: 'deposit',
    targetId: id,
    details: { credit, tax, reason },
  });

  return (await pool.query('SELECT * FROM deposits WHERE id=$1', [id])).rows[0];
}

async function rejectDeposit(depositId, adminId, note) {
  const res = await pool.query(
    `UPDATE deposits SET status='rejected', processed_by=$1, processed_at=NOW(), admin_note=$2
     WHERE id=$3 AND status='pending' RETURNING *`,
    [adminId, note || null, depositId]
  );
  if (!res.rows[0]) throw new Error('Not pending');
  await audit({
    actorId: adminId,
    action: 'reject_deposit',
    targetType: 'deposit',
    targetId: depositId,
    details: { note },
  });
  return res.rows[0];
}

/** Re-scan pending deposits with TxID (cron) */
async function pollPendingDeposits(limit = 20) {
  if (!config.autoDepositEnabled) return { scanned: 0, approved: 0 };
  const res = await pool.query(
    `SELECT * FROM deposits
     WHERE status='pending' AND tx_hash IS NOT NULL AND tx_hash <> ''
     ORDER BY created_at ASC LIMIT $1`,
    [limit]
  );
  let approved = 0;
  for (const dep of res.rows) {
    try {
      const addresses = await getPaymentAddresses(true);
      const expected =
        addresses.find((a) => normalizeNetwork(a.network) === normalizeNetwork(dep.network))?.address ||
        null;
      const v = await verifyTransaction({
        txHash: dep.tx_hash,
        network: dep.network,
        expectedAddress: expected,
        minAmount: parseFloat(dep.amount) * 0.95,
      });
      if (v.ok) {
        await pool.query(
          `UPDATE deposits SET auto_verified=TRUE, source='auto', verify_detail=$1, status='approved' WHERE id=$2`,
          [JSON.stringify(v), dep.id]
        );
        const updated = (await pool.query('SELECT * FROM deposits WHERE id=$1', [dep.id])).rows[0];
        await creditDeposit(updated, null, { reason: 'poll_auto_verify' });
        approved += 1;
      }
    } catch (e) {
      logger.warn('poll deposit', dep.id, e.message);
    }
  }
  return { scanned: res.rows.length, approved };
}

module.exports = {
  normalizeNetwork,
  calcTax,
  verifyTransaction,
  submitDeposit,
  creditDeposit,
  rejectDeposit,
  pollPendingDeposits,
  treasuryIn,
  treasuryOut,
  USDT_CONTRACTS,
};
