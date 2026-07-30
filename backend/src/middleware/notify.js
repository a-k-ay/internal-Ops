const { query } = require('../db')

const createNotification = async ({ workspaceId, userId, type, title, message, linkType, linkId }) => {
  try {
    if (!userId) return
    await query(
      `INSERT INTO notifications (workspace_id, user_id, type, title, message, link_type, link_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [workspaceId, userId, type, title, message, linkType || null, linkId || null]
    )
  } catch (err) {
    console.error('Notification error:', err.message)
  }
}

module.exports = { createNotification }
