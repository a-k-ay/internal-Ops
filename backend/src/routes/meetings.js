const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { verifyToken, requirePMOrAbove, requireSuperAdmin } = require('../middleware/auth')
const { auditLog } = require('../middleware/audit')
const { createNotification } = require('../middleware/notify')

// GET /api/meetings?projectId=xxx
router.get('/', verifyToken, async (req, res) => {
  const { projectId, clientId, from, to } = req.query
  try {
    let q = `SELECT m.*, p.name as project_name, c.name as client_name, u.full_name as created_by_name,
                    COUNT(DISTINCT a.id) as action_count,
                    COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'open' OR a.status = 'in_progress') as open_action_count
             FROM meetings m
             LEFT JOIN projects p ON p.id = m.project_id
             LEFT JOIN clients c ON c.id = m.client_id
             LEFT JOIN users u ON u.id = m.created_by
             LEFT JOIN action_items a ON a.meeting_id = m.id
             WHERE m.workspace_id = $1`
    const params = [req.user.workspaceId]
    let idx = 2
    if (projectId) { q += ` AND m.project_id = $${idx++}`; params.push(projectId) }
    if (clientId) { q += ` AND m.client_id = $${idx++}`; params.push(clientId) }
    if (from) { q += ` AND m.date >= $${idx++}`; params.push(from) }
    if (to) { q += ` AND m.date <= $${idx++}`; params.push(to) }
    q += ` GROUP BY m.id, p.name, c.name, u.full_name ORDER BY m.date DESC`
    const result = await query(q, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meetings' })
  }
})

// GET /api/meetings/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT m.*, p.name as project_name, c.name as client_name, u.full_name as created_by_name
       FROM meetings m
       LEFT JOIN projects p ON p.id = m.project_id
       LEFT JOIN clients c ON c.id = m.client_id
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.id = $1 AND m.workspace_id = $2`,
      [req.params.id, req.user.workspaceId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Meeting not found' })
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meeting' })
  }
})

// POST /api/meetings
router.post('/', verifyToken, requirePMOrAbove, async (req, res) => {
  const { projectId, clientId, title, date, attendees, venue, duration, objective, discussionPoints } = req.body
  if (!projectId || !clientId || !title || !date) return res.status(400).json({ error: 'Project, client, title and date are required' })

  try {
    const result = await query(
      `INSERT INTO meetings (workspace_id, project_id, client_id, title, date, attendees, venue, duration, objective, discussion_points, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.user.workspaceId, projectId, clientId, title.trim(), date, attendees || null, venue || null, duration || null, objective || null, discussionPoints || null, req.user.id]
    )
    const meeting = result.rows[0]
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'create', entityType: 'meeting', entityId: meeting.id, entityName: meeting.title })

    // Notify all workspace members about new meeting
    const members = await query(`SELECT id FROM users WHERE workspace_id = $1 AND id != $2 AND is_active = TRUE`, [req.user.workspaceId, req.user.id])
    for (const member of members.rows) {
      await createNotification({ workspaceId: req.user.workspaceId, userId: member.id, type: 'meeting_created', title: 'New Meeting Created', message: `${req.user.fullName} created meeting: ${meeting.title}`, linkType: 'meeting', linkId: meeting.id })
    }
    res.status(201).json(meeting)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create meeting' })
  }
})

// PUT /api/meetings/:id
router.put('/:id', verifyToken, requirePMOrAbove, async (req, res) => {
  const { title, date, attendees, venue, duration, objective, discussionPoints, aiSummary } = req.body
  try {
    const result = await query(
      `UPDATE meetings SET title = $1, date = $2, attendees = $3, venue = $4, duration = $5,
              objective = $6, discussion_points = $7, ai_summary = $8, updated_at = NOW()
       WHERE id = $9 AND workspace_id = $10 RETURNING *`,
      [title, date, attendees || null, venue || null, duration || null, objective || null, discussionPoints || null, aiSummary || null, req.params.id, req.user.workspaceId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Meeting not found' })
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'update', entityType: 'meeting', entityId: req.params.id, entityName: title })
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to update meeting' })
  }
})

// DELETE /api/meetings/:id
router.delete('/:id', verifyToken, requireSuperAdmin, async (req, res) => {
  try {
    const mtg = await query(`SELECT title FROM meetings WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user.workspaceId])
    if (!mtg.rows[0]) return res.status(404).json({ error: 'Meeting not found' })
    await query(`DELETE FROM meetings WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user.workspaceId])
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'delete', entityType: 'meeting', entityId: req.params.id, entityName: mtg.rows[0].title })
    res.json({ message: 'Meeting deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete meeting' })
  }
})

module.exports = router
