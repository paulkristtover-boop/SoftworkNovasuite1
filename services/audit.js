const pool = require('../database/pool');
const logger = require('../utils/logger');

async function logAudit({
  actorTelegramId = null,
  actorUserId = null,
  action,
  entityType = null,
  entityId = null,
  details = null,
}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_telegram_id, actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        actorTelegramId,
        actorUserId,
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (err) {
    logger.error(`[audit] Failed to write log: ${err.message}`);
  }
}

module.exports = { logAudit };
