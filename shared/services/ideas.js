const pool = require('../database/pool');
const { ValidationError } = require('../utils/errors');
const { logAudit } = require('./audit');

async function submitIdea(userId, content) {
  const text = String(content || '').trim();
  if (text.length < 10) throw new ValidationError('Please write a bit more detail (min 10 characters).');
  if (text.length > 2000) throw new ValidationError('Idea is too long (max 2000 characters).');

  const { rows } = await pool.query(
    `INSERT INTO ideas (user_id, content, status) VALUES ($1, $2, 'new') RETURNING *`,
    [userId, text]
  );
  await logAudit({
    actorUserId: userId,
    action: 'idea.submit',
    entityType: 'idea',
    entityId: rows[0].id,
  });
  return rows[0];
}

async function listIdeas(status = null, limit = 20) {
  if (status) {
    const { rows } = await pool.query(
      `SELECT i.*, u.telegram_id, u.username, u.first_name
       FROM ideas i JOIN users u ON u.id = i.user_id
       WHERE i.status = $1 ORDER BY i.created_at DESC LIMIT $2`,
      [status, limit]
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT i.*, u.telegram_id, u.username, u.first_name
     FROM ideas i JOIN users u ON u.id = i.user_id
     ORDER BY i.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function updateIdeaStatus(id, status, adminReply, adminUserId) {
  const { rows } = await pool.query(
    `UPDATE ideas SET status = $1, admin_reply = COALESCE($2, admin_reply), updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [status, adminReply || null, id]
  );
  if (rows[0]) {
    await logAudit({
      actorUserId: adminUserId,
      action: 'idea.update',
      entityType: 'idea',
      entityId: id,
      details: { status },
    });
  }
  return rows[0];
}

module.exports = { submitIdea, listIdeas, updateIdeaStatus };
