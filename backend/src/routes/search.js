const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { verifyToken } = require('../middleware/auth')

// GET /api/search?q=xxx - global search across meetings, clients, tracker, action items
router.get('/', verifyToken, async (req, res) => {
  const { q } = req.query
  if (!q || q.trim().length < 2) return res.json({ clients: [], meetings: [], actionItems: [], trackerItems: [] })

  const wid = req.user.workspaceId
  const search = `%${q.trim()}%`

  try {
    const [clients, meetings, actionItems, trackerItems] = await Promise.all([
      query(`SELECT id, name, project_name, is_archived FROM clients WHERE workspace_id = $1 AND (name ILIKE $2 OR project_name ILIKE $2) LIMIT 5`, [wid, search]),
      query(`SELECT m.id, m.title, m.date, c.name as client_name, p.name as project_name FROM meetings m LEFT JOIN clients c ON c.id = m.client_id LEFT JOIN projects p ON p.id = m.project_id WHERE m.workspace_id = $1 AND (m.title ILIKE $2 OR m.attendees ILIKE $2 OR m.objective ILIKE $2) LIMIT 5`, [wid, search]),
      query(`SELECT a.id, a.title, a.status, a.assigned_to_name, c.name as client_name FROM action_items a LEFT JOIN clients c ON c.id = a.client_id WHERE a.workspace_id = $1 AND (a.title ILIKE $2 OR a.assigned_to_name ILIKE $2) LIMIT 5`, [wid, search]),
      query(`SELECT t.id, t.description, t.status, t.classification, c.name as client_name FROM tracker_items t LEFT JOIN clients c ON c.id = t.client_id WHERE t.workspace_id = $1 AND (t.description ILIKE $2 OR t.classification ILIKE $2) LIMIT 5`, [wid, search])
    ])

    res.json({
      clients: clients.rows,
      meetings: meetings.rows,
      actionItems: actionItems.rows,
      trackerItems: trackerItems.rows
    })
  } catch (err) {
    console.error('[search] error:', err)
    res.status(500).json({ error: 'Search failed' })
  }
})

module.exports = router
