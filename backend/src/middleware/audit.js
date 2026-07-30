const { query } = require('../db')

const auditLog = async ({ workspaceId, userId, userName, action, entityType, entityId, entityName, changes }) => {
  try {
    await query(
      `INSERT INTO audit_logs (workspace_id, user_id, user_name, action, entity_type, entity_id, entity_name, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [workspaceId, userId, userName, action, entityType, entityId || null, entityName || null, changes ? JSON.stringify(changes) : null]
    )
  } catch (err) {
    console.error('Audit log error:', err.message)
  }
}

module.exports = { auditLog }
