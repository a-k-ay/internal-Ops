const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { verifyToken } = require('../middleware/auth')

// GET /api/notifications
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('[notifications] error:', err)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

// GET /api/notifications/unread-count
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    )
    res.json({ count: parseInt(result.rows[0].count) })
  } catch (err) {
    console.error('[notifications] error:', err)
    res.status(500).json({ error: 'Failed to fetch count' })
  }
})

// PUT /api/notifications/:id/read
router.put('/:id/read', verifyToken, async (req, res) => {
  try {
    await query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id])
    res.json({ message: 'Marked as read' })
  } catch (err) {
    console.error('[notifications] error:', err)
    res.status(500).json({ error: 'Failed to mark as read' })
  }
})

// PUT /api/notifications/read-all
router.put('/read-all/mark', verifyToken, async (req, res) => {
  try {
    await query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1`, [req.user.id])
    res.json({ message: 'All marked as read' })
  } catch (err) {
    console.error('[notifications] error:', err)
    res.status(500).json({ error: 'Failed to mark all as read' })
  }
})

module.exports = router
