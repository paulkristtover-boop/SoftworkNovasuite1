const { pool } = require('../database');
const { updateBalance } = require('./userService');
const { getSetting, setSetting } = require('./settingsService');
const { idempotencyKey } = require('../utils/helpers');
const { audit } = require('../utils/audit');
const config = require('../config');
const paymentService = require('./paymentService');

/** Create deposit — auto-verify + tax via paymentService */
async function createDeposit(opts) {
  return paymentService.submitDeposit(opts);
}

async function approveDeposit(depositId, adminId, { note, checklist } = {}) {
  const dep = (await pool.query('SELECT * FROM deposits WHERE id=$1', [depositId])).rows[0];
  if (!dep) throw new Error('Deposit not found');
  if (dep.status !== 'pending') throw new Error('Deposit not pending');
  return paymentService.creditDeposit(dep, adminId, { reason: note, checklist });
}

async function rejectDeposit(depositId, adminId, note) {
  return paymentService.rejectDeposit(depositId, adminId, note);
}

async function createWithdrawal({ userId, amount, network, address }) {
  const min = parseFloat(await getSetting('min_withdraw', String(config.minWithdraw)));
  if (amount < min) throw new Error(`Minimum withdrawal is ${min} USDT`);

  const taxPct = config.withdrawTaxPercent || 0;
  const { gross, tax, net } = paymentService.calcTax(amount, taxPct);
  const key = idempotencyKey('wd_req', userId, amount, network, address, Date.now());

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query('SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE', [userId]);
    if (!u.rows[0] || parseFloat(u.rows[0].balance) < gross) throw new Error('Insufficient balance');
    const newBal = parseFloat(u.rows[0].balance) - gross;
    await client.query('UPDATE users SET balance=$1, updated_at=NOW() WHERE telegram_id=$2', [newBal, userId]);
    const res = await client.query(
      `INSERT INTO withdrawals (user_id, amount, net_amount, tax_amount, network, address, status, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7) RETURNING *`,
      [userId, gross, net, tax, network, address, key]
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, reference_type, note, idempotency_key)
       VALUES ($1,'withdrawal_hold',$2,$3,$4,'withdrawal','Hold for withdrawal',$5)`,
      [userId, -gross, newBal, res.rows[0].id, idempotencyKey('wd_hold', res.rows[0].id)]
    );
    await client.query('COMMIT');
    return res.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function approveWithdrawal(withdrawalId, adminId, txHash, note) {
  const key = idempotencyKey('pay_wd', withdrawalId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query(`SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE`, [withdrawalId]);
    if (!w.rows[0] || w.rows[0].status !== 'pending') throw new Error('Invalid withdrawal status');
    const wd = w.rows[0];
    await client.query(
      `UPDATE withdrawals SET status='paid', tx_hash=$1, processed_by=$2, processed_at=NOW(), admin_note=$3 WHERE id=$4`,
      [txHash || null, adminId, note || null, withdrawalId]
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, reference_id, reference_type, note, created_by, idempotency_key)
       VALUES ($1,'withdrawal',$2,$3,'withdrawal',$4,$5,$6) ON CONFLICT (idempotency_key) DO NOTHING`,
      [wd.user_id, -parseFloat(wd.amount), withdrawalId, note || 'Paid by admin', adminId, key]
    );
    // total_withdrawn
    await client.query(
      `UPDATE users SET total_withdrawn = COALESCE(total_withdrawn,0) + $1, updated_at=NOW() WHERE telegram_id=$2`,
      [parseFloat(wd.amount), wd.user_id]
    );
    const payOut = parseFloat(wd.net_amount != null ? wd.net_amount : wd.amount);
    const tax = parseFloat(wd.tax_amount) || 0;
    const tb = parseFloat(await getSetting('treasury_balance', '0')) || 0;
    // Outflow = net paid to user; tax stays in treasury
    const newTb = tb - payOut;
    await client.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('treasury_balance',$1,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [String(newTb)]
    );
    await client.query(
      `INSERT INTO treasury_logs (type, amount, balance_after, note, tx_hash, tax_kind, created_by, idempotency_key)
       VALUES ('out',$1,$2,$3,$4,'withdraw_payout',$5,$6) ON CONFLICT (idempotency_key) DO NOTHING`,
      [-payOut, newTb, `Withdrawal #${withdrawalId}`, txHash, adminId, idempotencyKey('treasury_out_wd', withdrawalId)]
    );
    if (tax > 0) {
      await client.query(
        `INSERT INTO treasury_logs (type, amount, balance_after, note, tax_kind, created_by, idempotency_key)
         VALUES ('in',$1,$2,$3,'withdraw_tax',$4,$5) ON CONFLICT (idempotency_key) DO NOTHING`,
        [tax, newTb + tax, `Withdrawal #${withdrawalId} tax`, adminId, idempotencyKey('treasury_tax_wd', withdrawalId)]
      );
    }
    await client.query('COMMIT');
    await audit({ actorId: adminId, action: 'pay_withdrawal', targetType: 'withdrawal', targetId: withdrawalId, details: { txHash } });
    return wd;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function rejectWithdrawal(withdrawalId, adminId, note) {
  const key = idempotencyKey('reject_wd', withdrawalId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query(`SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE`, [withdrawalId]);
    if (!w.rows[0] || w.rows[0].status !== 'pending') throw new Error('Not pending');
    const wd = w.rows[0];
    await client.query(
      `UPDATE withdrawals SET status='rejected', processed_by=$1, processed_at=NOW(), admin_note=$2 WHERE id=$3`,
      [adminId, note || null, withdrawalId]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  const wd = (await pool.query('SELECT * FROM withdrawals WHERE id=$1', [withdrawalId])).rows[0];
  await updateBalance(wd.user_id, parseFloat(wd.amount), 'withdrawal_refund', {
    note: `Withdrawal #${withdrawalId} rejected`,
    referenceId: withdrawalId,
    referenceType: 'withdrawal',
    createdBy: adminId,
    idempotencyKey: key,
  });
  await audit({ actorId: adminId, action: 'reject_withdrawal', targetType: 'withdrawal', targetId: withdrawalId });
  return wd;
}

async function addTreasuryTransaction({ type, amount, note, txHash, adminId }) {
  const delta = type === 'out' ? -Math.abs(amount) : Math.abs(amount);
  const key = idempotencyKey('treasury', type, amount, note, Date.now());
  const tb = parseFloat(await getSetting('treasury_balance', '0')) || 0;
  const newTb = tb + delta;
  await setSetting('treasury_balance', String(newTb));
  await pool.query(
    `INSERT INTO treasury_logs (type, amount, balance_after, note, tx_hash, created_by, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [type, delta, newTb, note, txHash || null, adminId, key]
  );
  await pool.query(
    `INSERT INTO transactions (user_id, type, amount, note, created_by, idempotency_key)
     VALUES (NULL,$1,$2,$3,$4,$5)`,
    [type === 'out' ? 'treasury_out' : 'treasury_in', delta, note, adminId, idempotencyKey('tx_treasury', key)]
  );
  return newTb;
}

module.exports = {
  createDeposit,
  approveDeposit,
  rejectDeposit,
  createWithdrawal,
  approveWithdrawal,
  rejectWithdrawal,
  addTreasuryTransaction,
};
