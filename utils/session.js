const pool = require('../database/pool');

async function getSession(telegramId) {
  const { rows } = await pool.query(
    'SELECT state, data FROM user_sessions WHERE telegram_id = $1',
    [telegramId]
  );
  if (!rows[0]) return { state: null, data: {} };
  return {
    state: rows[0].state,
    data: rows[0].data || {},
  };
}

async function setSession(telegramId, state, data = {}) {
  await pool.query(
    `INSERT INTO user_sessions (telegram_id, state, data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (telegram_id)
     DO UPDATE SET state = $2, data = $3, updated_at = NOW()`,
    [telegramId, state, JSON.stringify(data)]
  );
}

async function clearSession(telegramId) {
  await pool.query(
    `INSERT INTO user_sessions (telegram_id, state, data, updated_at)
     VALUES ($1, NULL, '{}', NOW())
     ON CONFLICT (telegram_id)
     DO UPDATE SET state = NULL, data = '{}', updated_at = NOW()`,
    [telegramId]
  );
}

module.exports = { getSession, setSession, clearSession };
