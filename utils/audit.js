const { pool } = require('../database');

async function audit({ actorId, actorType = 'admin', action, targetType, targetId, details, ip }) {
  await pool.query(
    `INSERT INTO audit_logs (actor_id, actor_type, action, target_type, target_id, details, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actorId || null, actorType, action, targetType || null, targetId != null ? String(targetId) : null, details ? JSON.stringify(details) : null, ip || null]
  );
}

module.exports = { audit };
