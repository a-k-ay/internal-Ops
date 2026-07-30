const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { verifyToken, requireSuperAdmin } = require('../middleware/auth')

// GET /api/audit - only super_admin can view audit logs
router.get('/', verifyToken, requireSuperAdmin, async (req, res) => {
  const { entityType, from, to } = req.query
  try {
    let q = `SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id WHERE al.workspace_id = $1`
    const params = [req.user.workspaceId]
    let idx = 2
    if (entityType) { q += ` AND al.entity_type = $${idx++}`; params.push(entityType) }
    if (from) { q += ` AND al.created_at >= $${idx++}`; params.push(from) }
    if (to) { q += ` AND al.created_at <= $${idx++}`; params.push(to) }
    q += ` ORDER BY al.created_at DESC LIMIT 200`
    const result = await query(q, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit logs' })
  }
})

module.exports = router
