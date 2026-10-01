const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { verifyToken, requirePMOrAbove } = require('../middleware/auth')
const { auditLog } = require('../middleware/audit')
const { createNotification } = require('../middleware/notify')

// GET /api/action-items?meetingId=xxx
router.get('/', verifyToken, async (req, res) => {
  const { meetingId, projectId, assignedTo } = req.query
  const isMember = req.user.role === 'member'
  try {
    let q = `SELECT a.*, u.full_name as assigned_to_full_name, u2.full_name as created_by_name
             FROM action_items a
             LEFT JOIN users u ON u.id = a.assigned_to
             LEFT JOIN users u2 ON u2.id = a.created_by
             WHERE a.workspace_id = $1`
    const params = [req.user.workspaceId]
    let idx = 2
    if (meetingId) { q += ` AND a.meeting_id = $${idx++}`; params.push(meetingId) }
    if (projectId) { q += ` AND a.project_id = $${idx++}`; params.push(projectId) }
    // Members always see only their own assigned items, regardless of other filters
    if (isMember) {
      q += ` AND a.assigned_to = $${idx++}`; params.push(req.user.id)
    } else if (assignedTo) {
      q += ` AND a.assigned_to = $${idx++}`; params.push(assignedTo)
    }
    q += ` ORDER BY a.created_at ASC`
    const result = await query(q, params)
    res.json(result.rows)
  } catch (err) {
    console.error('[actionItems] error:', err)
    res.status(500).json({ error: 'Failed to fetch action items' })
  }
})

// POST /api/action-items
router.post('/', verifyToken, requirePMOrAbove, async (req, res) => {
  const { meetingId, projectId, clientId, title, assignedTo, assignedToName, dueDate } = req.body
  if (!meetingId || !title) return res.status(400).json({ error: 'Meeting and title are required' })

  try {
    const result = await query(
      `INSERT INTO action_items (workspace_id, meeting_id, project_id, client_id, title, assigned_to, assigned_to_name, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.user.workspaceId, meetingId, projectId, clientId, title.trim(), assignedTo || null, assignedToName || null, dueDate || null, req.user.id]
    )
    const item = result.rows[0]
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'create', entityType: 'action_item', entityId: item.id, entityName: item.title })

    // Notify assigned user
    if (assignedTo && assignedTo !== req.user.id) {
      await createNotification({ workspaceId: req.user.workspaceId, userId: assignedTo, type: 'action_assigned', title: 'Action Item Assigned to You', message: `${req.user.fullName} assigned you: "${title}"`, linkType: 'action_item', linkId: item.id })
    }
    res.status(201).json(item)
  } catch (err) {
    console.error('[actionItems] error:', err)
    res.status(500).json({ error: 'Failed to create action item' })
  }
})

// PUT /api/action-items/:id
router.put('/:id', verifyToken, async (req, res) => {
  // non-status fields are read from req.body directly via pick() below
  const { title, status } = req.body
  try {
    // Fetch existing item
    const existing = await query(`SELECT * FROM action_items WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user.workspaceId])
    if (!existing.rows[0]) return res.status(404).json({ error: 'Action item not found' })
    const item = existing.rows[0]

    // Authorization: members may only update items assigned to them, and
    // may only change `status`. PM/admin can change any field. Reject
    // disallowed fields explicitly rather than silently dropping them so a
    // misbehaving client surfaces as a 403 rather than a confusing no-op.
    if (req.user.role === 'member') {
      if (item.assigned_to !== req.user.id) {
        return res.status(403).json({ error: 'You can only update items assigned to you' })
      }
      const memberForbidden = ['title', 'assignedTo', 'assignedToName', 'dueDate'].filter(k => k in req.body)
      if (memberForbidden.length) {
        return res.status(403).json({ error: `Members can only change status (got: ${memberForbidden.join(', ')})` })
      }
    }

    // If item is tracked and user tries to close it directly, warn them
    if (item.is_tracked && status === 'closed' && item.status !== 'closed') {
      // Allow it but we flag it — frontend handles the warning message
    }

    // Respect explicit null in the payload so clients can clear
    // assigned_to / assigned_to_name / due_date (same pattern used in
    // tracker.js). Fields missing from the body fall back to current.
    const pick = (key, current) => (key in req.body ? req.body[key] : current)

    const result = await query(
      `UPDATE action_items SET title = $1, assigned_to = $2, assigned_to_name = $3, due_date = $4, status = $5, updated_at = NOW()
       WHERE id = $6 AND workspace_id = $7 RETURNING *`,
      [title || item.title,
       pick('assignedTo', item.assigned_to),
       pick('assignedToName', item.assigned_to_name),
       pick('dueDate', item.due_date),
       status || item.status,
       req.params.id, req.user.workspaceId]
    )

    // Notify PM if status changed
    if (status && status !== item.status) {
      const creator = await query(`SELECT id FROM users WHERE id = $1`, [item.created_by])
      if (creator.rows[0] && creator.rows[0].id !== req.user.id) {
        await createNotification({ workspaceId: req.user.workspaceId, userId: item.created_by, type: 'status_changed', title: 'Action Item Status Updated', message: `"${item.title}" was updated to ${status} by ${req.user.fullName}`, linkType: 'action_item', linkId: item.id })
      }
    }

    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'update', entityType: 'action_item', entityId: req.params.id, entityName: item.title, changes: { status: { from: item.status, to: status } } })
    res.json(result.rows[0])
  } catch (err) {
    console.error('[actionItems] error:', err)
    res.status(500).json({ error: 'Failed to update action item' })
  }
})

// PUT /api/action-items/:id/add-to-tracker
// Marks action item as tracked and links it to a tracker item
router.put('/:id/add-to-tracker', verifyToken, requirePMOrAbove, async (req, res) => {
  const { trackerItemId } = req.body
  try {
    const result = await query(
      `UPDATE action_items SET is_tracked = TRUE, tracker_item_id = $1, updated_at = NOW()
       WHERE id = $2 AND workspace_id = $3 RETURNING *`,
      [trackerItemId, req.params.id, req.user.workspaceId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Action item not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error('[actionItems] error:', err)
    res.status(500).json({ error: 'Failed to link tracker item' })
  }
})

// DELETE /api/action-items/:id
router.delete('/:id', verifyToken, requirePMOrAbove, async (req, res) => {
  try {
    const item = await query(`SELECT title FROM action_items WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user.workspaceId])
    if (!item.rows[0]) return res.status(404).json({ error: 'Action item not found' })
    await query(`DELETE FROM action_items WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user.workspaceId])
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'delete', entityType: 'action_item', entityId: req.params.id, entityName: item.rows[0].title })
    res.json({ message: 'Action item deleted' })
  } catch (err) {
    console.error('[actionItems] error:', err)
    res.status(500).json({ error: 'Failed to delete action item' })
  }
})

// DELETE /api/action-items/bulk - bulk delete
router.delete('/bulk/delete', verifyToken, requirePMOrAbove, async (req, res) => {
  const { ids } = req.body
  if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' })
  try {
    await query(`DELETE FROM action_items WHERE id = ANY($1::uuid[]) AND workspace_id = $2`, [ids, req.user.workspaceId])
    res.json({ message: `${ids.length} items deleted` })
  } catch (err) {
    console.error('[actionItems] error:', err)
    res.status(500).json({ error: 'Failed to bulk delete' })
  }
})

module.exports = router
