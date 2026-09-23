import pool from './db';
import { notifyUser } from './notify';
import { money } from './format';

/* ── Dashboard ── */
async function getDashboard() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT balance FROM trust_wallet ORDER BY id LIMIT 1) AS trust_balance,
      (SELECT COUNT(*)::int FROM deposits WHERE status = 'pending') AS pending_deps,
      (SELECT COUNT(*)::int FROM withdrawals WHERE status = 'pending') AS pending_wds,
      (SELECT COUNT(*)::int FROM users) AS users_count,
      (SELECT COALESCE(SUM(balance),0) FROM users) AS user_balances,
      (SELECT COUNT(*)::int FROM ideas WHERE status = 'new') AS new_ideas,
      (SELECT COUNT(*)::int FROM ad_campaigns WHERE status = 'pending') AS pending_campaigns,
      (SELECT COUNT(*)::int FROM ad_campaigns WHERE status = 'active') AS active_campaigns,
      (SELECT COUNT(*)::int FROM referral_rewards) AS referral_rewards_count
  `);
  return rows[0];
}

/* ── Deposits ── */
async function listPendingDeposits(limit = 50) {
  const { rows } = await pool.query(
    `SELECT d.*, u.telegram_id, u.username, u.first_name, u.last_name
     FROM deposits d JOIN users u ON u.id = d.user_id
     WHERE d.status = 'pending' ORDER BY d.created_at ASC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function listDeposits(status, limit = 50) {
  const params = [limit];
  let where = '';
  if (status && status !== 'all') {
    where = 'WHERE d.status = $2';
    params.push(status);
  }
  const { rows } = await pool.query(
    `SELECT d.*, u.telegram_id, u.username, u.first_name
     FROM deposits d JOIN users u ON u.id = d.user_id
     ${where} ORDER BY d.created_at DESC LIMIT $1`,
    params
  );
  return rows;
}

async function approveDeposit(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM deposits WHERE id = $1 FOR UPDATE`, [id]);
    const d = rows[0];
    if (!d) throw new Error('Deposit not found');
    if (d.status !== 'pending') throw new Error(`Already ${d.status}`);

    await client.query(
      `UPDATE deposits SET status = 'approved', reviewed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await client.query(
      `UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
      [d.amount, d.user_id]
    );
    await client.query(
      `UPDATE trust_wallet SET balance = balance + $1, updated_at = NOW() WHERE id = (SELECT id FROM trust_wallet ORDER BY id LIMIT 1)`,
      [d.amount]
    );
    await client.query(
      `INSERT INTO ledger_transactions (type, amount, currency, direction, reference_type, reference_id, note)
       VALUES ('deposit_credit', $1, 'USDT', 'in', 'deposit', $2, $3)`,
      [d.amount, id, `Deposit approved ${id}`]
    );
    await client.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details)
       VALUES ('deposit.approve', 'deposit', $1, $2)`,
      [id, JSON.stringify({ amount: d.amount, userId: d.user_id })]
    );
    await client.query('COMMIT');

    const { rows: urows } = await pool.query(`SELECT telegram_id FROM users WHERE id = $1`, [d.user_id]);
    if (urows[0]) {
      await notifyUser(
        urows[0].telegram_id,
        `✅ <b>Deposit approved</b>\n\nAmount: <b>${money(d.amount)}</b>\nYour balance has been credited.`
      );
    }
    return d;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function rejectDeposit(id, note) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM deposits WHERE id = $1 FOR UPDATE`, [id]);
    const d = rows[0];
    if (!d) throw new Error('Deposit not found');
    if (d.status !== 'pending') throw new Error(`Already ${d.status}`);

    await client.query(
      `UPDATE deposits SET status = 'rejected', admin_note = $1, reviewed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [note || null, id]
    );
    await client.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details)
       VALUES ('deposit.reject', 'deposit', $1, $2)`,
      [id, JSON.stringify({ note })]
    );
    await client.query('COMMIT');

    const { rows: urows } = await pool.query(`SELECT telegram_id FROM users WHERE id = $1`, [d.user_id]);
    if (urows[0]) {
      await notifyUser(
        urows[0].telegram_id,
        `❌ <b>Deposit rejected</b>\n\nAmount: ${money(d.amount)}${note ? `\nNote: ${note}` : ''}`
      );
    }
    return d;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/* ── Withdrawals ── */
async function listPendingWithdrawals(limit = 50) {
  const { rows } = await pool.query(
    `SELECT w.*, u.telegram_id, u.username, u.first_name
     FROM withdrawals w JOIN users u ON u.id = w.user_id
     WHERE w.status = 'pending' ORDER BY w.created_at ASC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function listWithdrawals(status, limit = 50) {
  const params = [limit];
  let where = '';
  if (status && status !== 'all') {
    where = 'WHERE w.status = $2';
    params.push(status);
  }
  const { rows } = await pool.query(
    `SELECT w.*, u.telegram_id, u.username, u.first_name
     FROM withdrawals w JOIN users u ON u.id = w.user_id
     ${where} ORDER BY w.created_at DESC LIMIT $1`,
    params
  );
  return rows;
}

async function markWithdrawalPaid(id, note) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE`, [id]);
    const w = rows[0];
    if (!w) throw new Error('Withdrawal not found');
    if (w.status !== 'pending') throw new Error(`Already ${w.status}`);

    await client.query(
      `UPDATE withdrawals SET status = 'paid', admin_note = $1, reviewed_at = NOW(), paid_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [note || null, id]
    );
    await client.query(
      `UPDATE trust_wallet SET balance = balance - $1, updated_at = NOW() WHERE id = (SELECT id FROM trust_wallet ORDER BY id LIMIT 1)`,
      [w.amount]
    );
    await client.query(
      `INSERT INTO ledger_transactions (type, amount, currency, direction, reference_type, reference_id, note)
       VALUES ('withdrawal_debit', $1, 'USDT', 'out', 'withdrawal', $2, $3)`,
      [w.amount, id, `Withdrawal paid ${id}`]
    );
    await client.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details)
       VALUES ('withdrawal.pay', 'withdrawal', $1, $2)`,
      [id, JSON.stringify({ amount: w.amount })]
    );
    await client.query('COMMIT');

    const { rows: urows } = await pool.query(`SELECT telegram_id FROM users WHERE id = $1`, [w.user_id]);
    if (urows[0]) {
      await notifyUser(
        urows[0].telegram_id,
        `✅ <b>Withdrawal paid</b>\n\nAmount: <b>${money(w.amount)}</b>\nNetwork: ${w.network}\nTo: <code>${w.to_address}</code>`
      );
    }
    return w;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function rejectWithdrawal(id, note) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE`, [id]);
    const w = rows[0];
    if (!w) throw new Error('Withdrawal not found');
    if (w.status !== 'pending') throw new Error(`Already ${w.status}`);

    await client.query(
      `UPDATE withdrawals SET status = 'rejected', admin_note = $1, reviewed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [note || null, id]
    );
    // refund
    await client.query(
      `UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
      [w.amount, w.user_id]
    );
    await client.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details)
       VALUES ('withdrawal.reject', 'withdrawal', $1, $2)`,
      [id, JSON.stringify({ note })]
    );
    await client.query('COMMIT');

    const { rows: urows } = await pool.query(`SELECT telegram_id FROM users WHERE id = $1`, [w.user_id]);
    if (urows[0]) {
      await notifyUser(
        urows[0].telegram_id,
        `❌ <b>Withdrawal rejected</b>\n\nAmount: ${money(w.amount)} has been returned to your balance.${note ? `\nNote: ${note}` : ''}`
      );
    }
    return w;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/* ── Addresses ── */
async function listAddresses() {
  const { rows } = await pool.query(`SELECT * FROM payment_addresses ORDER BY network, id`);
  return rows;
}

async function addAddress({ network, address, label, instructions }) {
  const { rows } = await pool.query(
    `INSERT INTO payment_addresses (network, currency, address, label, instructions, is_active)
     VALUES ($1, 'USDT', $2, $3, $4, TRUE) RETURNING *`,
    [network, address, label || null, instructions || null]
  );
  return rows[0];
}

async function toggleAddress(id) {
  const { rows } = await pool.query(
    `UPDATE payment_addresses SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0];
}

async function deleteAddress(id) {
  await pool.query(`DELETE FROM payment_addresses WHERE id = $1`, [id]);
}

/* ── Users ── */
async function listUsers(limit = 100) {
  const { rows } = await pool.query(
    `SELECT id, telegram_id, username, first_name, last_name, balance, is_banned, ban_reason, accepted_terms, created_at, last_active_at
     FROM users ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function banUser(id, reason) {
  await pool.query(
    `UPDATE users SET is_banned = TRUE, ban_reason = $1, updated_at = NOW() WHERE id = $2`,
    [reason || 'Banned by admin', id]
  );
}

async function unbanUser(id) {
  await pool.query(
    `UPDATE users SET is_banned = FALSE, ban_reason = NULL, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

/* ── Ideas ── */
async function listIdeas(status) {
  const params = [];
  let where = '';
  if (status && status !== 'all') {
    where = 'WHERE i.status = $1';
    params.push(status);
  }
  const { rows } = await pool.query(
    `SELECT i.*, u.username, u.first_name, u.telegram_id
     FROM ideas i JOIN users u ON u.id = i.user_id
     ${where} ORDER BY i.created_at DESC LIMIT 100`,
    params
  );
  return rows;
}

async function updateIdeaStatus(id, status, reply) {
  const { rows } = await pool.query(
    `UPDATE ideas SET status = $1, admin_reply = COALESCE($2, admin_reply), updated_at = NOW() WHERE id = $3 RETURNING *`,
    [status, reply || null, id]
  );
  return rows[0];
}

/* ── Treasury ── */
async function getTreasury() {
  const { rows } = await pool.query(`SELECT * FROM trust_wallet ORDER BY id LIMIT 1`);
  return rows[0];
}

async function listLedger(limit = 50) {
  const { rows } = await pool.query(
    `SELECT * FROM ledger_transactions ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function adminAdjust(amount, note, direction) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const delta = direction === 'out' ? -Math.abs(amount) : Math.abs(amount);
    await client.query(
      `UPDATE trust_wallet SET balance = balance + $1, updated_at = NOW() WHERE id = (SELECT id FROM trust_wallet ORDER BY id LIMIT 1)`,
      [delta]
    );
    await client.query(
      `INSERT INTO ledger_transactions (type, amount, currency, direction, reference_type, note)
       VALUES ('admin_adjust', $1, 'USDT', $2, 'manual', $3)`,
      [Math.abs(amount), direction === 'out' ? 'out' : 'in', note || 'Admin adjustment']
    );
    await client.query(
      `INSERT INTO audit_logs (action, entity_type, details)
       VALUES ('treasury.adjust', 'trust_wallet', $1)`,
      [JSON.stringify({ amount, direction, note })]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/* ── Audit ── */
async function listAudit(limit = 100) {
  const { rows } = await pool.query(
    `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}


/* ── PTC Campaigns ── */
async function listCampaigns(status, limit = 50) {
  const params = [limit];
  let where = '';
  if (status && status !== 'all') {
    where = 'WHERE c.status = $2';
    params.push(status);
  }
  const { rows } = await pool.query(
    `SELECT c.*, u.telegram_id, u.username, u.first_name
     FROM ad_campaigns c JOIN users u ON u.id = c.advertiser_id
     ${where} ORDER BY c.created_at DESC LIMIT $1`,
    params
  );
  return rows;
}

async function approveCampaign(id) {
  const { rows } = await pool.query(
    `UPDATE ad_campaigns SET status = 'active', reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id]
  );
  if (!rows[0]) throw new Error('Campaign not found or not pending');
  const { rows: urows } = await pool.query(`SELECT telegram_id FROM users WHERE id = $1`, [rows[0].advertiser_id]);
  if (urows[0]) {
    await notifyUser(urows[0].telegram_id, `✅ <b>Your ad campaign is live!</b>\n\nTitle: ${rows[0].title}\nUsers can now earn by viewing it.`);
  }
  return rows[0];
}

async function rejectCampaign(id, note) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM ad_campaigns WHERE id = $1 FOR UPDATE`, [id]);
    const c = rows[0];
    if (!c) throw new Error('Not found');
    if (c.status !== 'pending') throw new Error(`Already ${c.status}`);
    const refund = Number(c.budget_total) - Number(c.budget_spent);
    if (refund > 0) {
      await client.query(`UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2`, [refund, c.advertiser_id]);
    }
    await client.query(
      `UPDATE ad_campaigns SET status = 'rejected', admin_note = $1, reviewed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [note || null, id]
    );
    await client.query('COMMIT');
    const { rows: urows } = await pool.query(`SELECT telegram_id FROM users WHERE id = $1`, [c.advertiser_id]);
    if (urows[0]) {
      await notifyUser(urows[0].telegram_id, `❌ <b>Ad campaign rejected</b>\n\nTitle: ${c.title}\nBudget refunded.${note ? '\nNote: ' + note : ''}`);
    }
    return c;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function pauseCampaign(id) {
  const { rows } = await pool.query(
    `UPDATE ad_campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1 AND status = 'active' RETURNING *`,
    [id]
  );
  if (!rows[0]) throw new Error('Not active');
  return rows[0];
}

async function resumeCampaign(id) {
  const { rows } = await pool.query(
    `UPDATE ad_campaigns SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'paused' RETURNING *`,
    [id]
  );
  if (!rows[0]) throw new Error('Not paused');
  return rows[0];
}



async function getPtcSettings() {
  const { rows } = await pool.query(`SELECT * FROM ptc_settings ORDER BY id LIMIT 1`);
  return rows[0];
}

async function updatePtcSettings(fields) {
  const allowed = [
    'default_reward', 'min_campaign_budget', 'min_reward_per_view', 'max_reward_per_view',
    'referral_signup_bonus', 'referral_welcome_bonus', 'referral_earn_percent', 'daily_view_limit', 'claim_delay_seconds',
    'daily_checkin_base', 'daily_checkin_streak_bonus'
  ];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const k of allowed) {
    if (fields[k] !== undefined && fields[k] !== null && fields[k] !== '') {
      sets.push(`${k} = $${i++}`);
      vals.push(fields[k]);
    }
  }
  if (!sets.length) return getPtcSettings();
  sets.push('updated_at = NOW()');
  await pool.query(`UPDATE ptc_settings SET ${sets.join(', ')} WHERE id = (SELECT id FROM ptc_settings ORDER BY id LIMIT 1)`, vals);
  return getPtcSettings();
}


async function boostCampaign(id) {
  const { rows } = await pool.query(
    `UPDATE ad_campaigns SET priority = priority + 10, updated_at = NOW() WHERE id = $1 AND status = 'active' RETURNING *`,
    [id]
  );
  if (!rows[0]) throw new Error('Campaign not active');
  return rows[0];
}


async function listRecentReferralRewards(limit = 50) {
  const { rows } = await pool.query(
    `SELECT r.*,
      u1.telegram_id AS referrer_tg, u1.username AS referrer_username,
      u2.telegram_id AS referred_tg, u2.username AS referred_username, u2.first_name AS referred_name
     FROM referral_rewards r
     JOIN users u1 ON u1.id = r.referrer_id
     JOIN users u2 ON u2.id = r.referred_id
     ORDER BY r.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

export {
  getDashboard,
  listPendingDeposits,
  listDeposits,
  approveDeposit,
  rejectDeposit,
  listPendingWithdrawals,
  listWithdrawals,
  markWithdrawalPaid,
  rejectWithdrawal,
  listAddresses,
  addAddress,
  toggleAddress,
  deleteAddress,
  listUsers,
  banUser,
  unbanUser,
  listIdeas,
  updateIdeaStatus,
  getTreasury,
  listLedger,
  adminAdjust,
  listAudit,
  listCampaigns,
  approveCampaign,
  rejectCampaign,
  pauseCampaign,
  resumeCampaign,
  boostCampaign,
  listRecentReferralRewards,
  getPtcSettings,
  updatePtcSettings,
};
