const { pool } = require('../database');
const { updateBalance } = require('./userService');
const { getSetting, setSetting } = require('./settingsService');
const { idempotencyKey } = require('../utils/helpers');
const config = require('../config');

async function maybeGrantWelcomeBonus(telegramId, { notifyAdmins, telegram } = {}) {
  const amount = parseFloat(
    (await getSetting('welcome_bonus_amount', String(config.welcomeBonusAmount))) || config.welcomeBonusAmount
  );
  const limit = parseInt(
    (await getSetting('welcome_bonus_limit', String(config.welcomeBonusLimit))) || config.welcomeBonusLimit,
    10
  );

  if (!amount || amount <= 0 || !limit || limit <= 0) {
    return { granted: false, reason: 'disabled', amount: 0, limit, remaining: 0 };
  }

  const prior = await pool.query(
    `SELECT id, amount FROM transactions WHERE user_id=$1 AND type='welcome_bonus' LIMIT 1`,
    [telegramId]
  );
  if (prior.rows[0]) {
    return {
      granted: false,
      reason: 'already',
      amount: parseFloat(prior.rows[0].amount),
      limit,
      remaining: null,
    };
  }

  const given = await pool.query(`SELECT COUNT(*)::int AS c FROM transactions WHERE type='welcome_bonus'`);
  if (given.rows[0].c >= limit) {
    return { granted: false, reason: 'sold_out', remaining: 0, limit, amount };
  }

  const key = idempotencyKey('welcome_bonus', telegramId);
  try {
    const result = await updateBalance(telegramId, amount, 'welcome_bonus', {
      note: `Welcome starter credit (first ${limit} users) — use for Earn / Advertise`,
      idempotencyKey: key,
    });
    if (result.duplicate) {
      return { granted: false, reason: 'already', amount, limit };
    }

    const remaining = Math.max(0, limit - (given.rows[0].c + 1));
    await setSetting('welcome_bonus_remaining', String(remaining));

    if (notifyAdmins && telegram && config.adminIds?.length) {
      const msg = `🎁 Welcome bonus credited\nUser: ${telegramId}\nAmount: ${amount} USDT\nSpots left: ${remaining}/${limit}`;
      for (const aid of config.adminIds) {
        try {
          await telegram.sendMessage(aid, msg);
        } catch (_) {}
      }
    }

    return { granted: true, amount, remaining, limit };
  } catch (e) {
    return { granted: false, reason: e.message, amount, limit };
  }
}

async function welcomeBonusStatus() {
  const amount = parseFloat(
    (await getSetting('welcome_bonus_amount', String(config.welcomeBonusAmount))) || 0
  );
  const limit = parseInt(
    (await getSetting('welcome_bonus_limit', String(config.welcomeBonusLimit))) || 30,
    10
  );
  const given = await pool.query(`SELECT COUNT(*)::int AS c FROM transactions WHERE type='welcome_bonus'`);
  const used = given.rows[0].c;
  return {
    amount,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    active: amount > 0 && limit > 0 && used < limit,
  };
}

async function hasWelcomeBonus(telegramId) {
  const r = await pool.query(
    `SELECT amount, created_at FROM transactions WHERE user_id=$1 AND type='welcome_bonus' LIMIT 1`,
    [telegramId]
  );
  return r.rows[0] || null;
}

module.exports = { maybeGrantWelcomeBonus, welcomeBonusStatus, hasWelcomeBonus };
