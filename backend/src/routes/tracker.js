const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { verifyToken, requirePMOrAbove } = require('../middleware/auth')
const { auditLog } = require('../middleware/audit')
const { createNotification } = require('../middleware/notify')

// GET /api/tracker?projectId=xxx&clientId=xxx&status=xxx&classification=xxx&from=xxx&to=xxx
router.get('/', verifyToken, async (req, res) => {
  const { projectId, clientId, status, classification, from, to, search } = req.query
  try {
    let q = `SELECT t.*, p.name as project_name, c.name as client_name,
                    a.title as action_item_title, a.status as action_item_status,
                    u.full_name as created_by_name
             FROM tracker_items t
             LEFT JOIN projects p ON p.id = t.project_id
             LEFT JOIN clients c ON c.id = t.client_id
             LEFT JOIN action_items a ON a.id = t.action_item_id
             LEFT JOIN users u ON u.id = t.created_by
             WHERE t.workspace_id = $1`
    const params = [req.user.workspaceId]
    let idx = 2
    if (projectId) { q += ` AND t.project_id = $${idx++}`; params.push(projectId) }
    if (clientId) { q += ` AND t.client_id = $${idx++}`; params.push(clientId) }
    if (status) { q += ` AND t.status = $${idx++}`; params.push(status) }
    if (classification) { q += ` AND t.classification = $${idx++}`; params.push(classification) }
    if (from) { q += ` AND t.raised_date >= $${idx++}`; params.push(from) }
    if (to) { q += ` AND t.raised_date <= $${idx++}`; params.push(to) }
    if (search) { q += ` AND (t.description ILIKE $${idx} OR t.classification ILIKE $${idx} OR t.status ILIKE $${idx})`; params.push(`%${search}%`); idx++ }
    q += ` ORDER BY t.created_at DESC`
    const result = await query(q, params)
    res.json(result.rows)
  } catch (err) {
    console.error('[tracker] error:', err)
    res.status(500).json({ error: 'Failed to fetch tracker items' })
  }
})

// GET /api/tracker/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*, p.name as project_name, c.name as client_name, a.title as action_item_title
       FROM tracker_items t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN action_items a ON a.id = t.action_item_id
       WHERE t.id = $1 AND t.workspace_id = $2`,
      [req.params.id, req.user.workspaceId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Tracker item not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error('[tracker] error:', err)
    res.status(500).json({ error: 'Failed to fetch tracker item' })
  }
})

// POST /api/tracker
router.post('/', verifyToken, requirePMOrAbove, async (req, res) => {
  const { projectId, clientId, actionItemId, description, classification, raisedDate, devStartDate, deployedDate, raisedBy, remarks } = req.body
  if (!projectId || !clientId || !description) return res.status(400).json({ error: 'Project, client and description are required' })

  try {
    const result = await query(
      `INSERT INTO tracker_items (workspace_id, project_id, client_id, action_item_id, description, classification, raised_date, dev_start_date, deployed_date, raised_by, remarks, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [req.user.workspaceId, projectId, clientId, actionItemId || null, description.trim(), classification || 'issue', raisedDate || null, devStartDate || null, deployedDate || null, raisedBy || null, remarks || null, req.user.id]
    )
    const item = result.rows[0]

    // If created from an action item, link back
    if (actionItemId) {
      await query(`UPDATE action_items SET is_tracked = TRUE, tracker_item_id = $1, updated_at = NOW() WHERE id = $2 AND workspace_id = $3`, [item.id, actionItemId, req.user.workspaceId])
    }

    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'create', entityType: 'tracker_item', entityId: item.id, entityName: item.description.substring(0, 50) })
    res.status(201).json(item)
  } catch (err) {
    console.error('[tracker] error:', err)
    res.status(500).json({ error: 'Failed to create tracker item' })
  }
})

// PUT /api/tracker/:id
// PM/admin only — members shouldn't touch the tracker directly; their
// action-item status changes propagate here via the one-way sync.
router.put('/:id', verifyToken, requirePMOrAbove, async (req, res) => {
  const { description, classification, status, raisedDate, devStartDate, deployedDate, raisedBy, remarks } = req.body
  try {
    const existing = await query(`SELECT * FROM tracker_items WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user.workspaceId])
    if (!existing.rows[0]) return res.status(404).json({ error: 'Tracker item not found' })
    const item = existing.rows[0]

    // For date fields, respect explicit null so the client can clear them.
    // Falls back to existing value only when the key is not present in the payload.
    const pick = (key, current) => (key in req.body ? req.body[key] : current)

    const result = await query(
      `UPDATE tracker_items SET description = $1, classification = $2, status = $3,
              raised_date = $4, dev_start_date = $5, deployed_date = $6,
              raised_by = $7, remarks = $8, updated_at = NOW()
       WHERE id = $9 AND workspace_id = $10 RETURNING *`,
      [description || item.description, classification || item.classification, status || item.status,
       pick('raisedDate', item.raised_date), pick('devStartDate', item.dev_start_date), pick('deployedDate', item.deployed_date),
       raisedBy || item.raised_by, remarks || item.remarks, req.params.id, req.user.workspaceId]
    )

    // TRACKER → ACTION ITEM SYNC (one-way)
    // If tracker status changes and there's a linked action item, sync it
    if (status && status !== item.status && item.action_item_id) {
      const actionStatus = status === 'closed' ? 'closed' : status === 'in_progress' ? 'in_progress' : 'open'
      await query(`UPDATE action_items SET status = $1, updated_at = NOW() WHERE id = $2 AND workspace_id = $3`, [actionStatus, item.action_item_id, req.user.workspaceId])

      // Notify PM about sync
      const actionItem = await query(`SELECT created_by, title FROM action_items WHERE id = $1`, [item.action_item_id])
      if (actionItem.rows[0] && actionItem.rows[0].created_by !== req.user.id) {
        await createNotification({ workspaceId: req.user.workspaceId, userId: actionItem.rows[0].created_by, type: 'tracker_updated', title: 'Tracker Status Synced', message: `Tracker item updated to "${status}" — action item "${actionItem.rows[0].title}" has been synced automatically`, linkType: 'tracker_item', linkId: item.id })
      }
    }

    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'update', entityType: 'tracker_item', entityId: req.params.id, entityName: item.description.substring(0, 50), changes: { status: { from: item.status, to: status } } })
    res.json(result.rows[0])
  } catch (err) {
    console.error('[tracker] error:', err)
    res.status(500).json({ error: 'Failed to update tracker item' })
  }
})

// DELETE /api/tracker/:id
router.delete('/:id', verifyToken, requirePMOrAbove, async (req, res) => {
  try {
    const item = await query(`SELECT description, action_item_id FROM tracker_items WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user.workspaceId])
    if (!item.rows[0]) return res.status(404).json({ error: 'Tracker item not found' })

    // Unlink from action item if linked
    if (item.rows[0].action_item_id) {
      await query(`UPDATE action_items SET is_tracked = FALSE, tracker_item_id = NULL, updated_at = NOW() WHERE id = $1`, [item.rows[0].action_item_id])
    }

    await query(`DELETE FROM tracker_items WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user.workspaceId])
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'delete', entityType: 'tracker_item', entityId: req.params.id })
    res.json({ message: 'Tracker item deleted' })
  } catch (err) {
    console.error('[tracker] error:', err)
    res.status(500).json({ error: 'Failed to delete tracker item' })
  }
})

// DELETE /api/tracker/bulk/delete
router.delete('/bulk/delete', verifyToken, requirePMOrAbove, async (req, res) => {
  const { ids } = req.body
  if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' })
  try {
    // Unlink action items first
    await query(`UPDATE action_items SET is_tracked = FALSE, tracker_item_id = NULL WHERE tracker_item_id = ANY($1::uuid[]) AND workspace_id = $2`, [ids, req.user.workspaceId])
    await query(`DELETE FROM tracker_items WHERE id = ANY($1::uuid[]) AND workspace_id = $2`, [ids, req.user.workspaceId])
    res.json({ message: `${ids.length} items deleted` })
  } catch (err) {
    console.error('[tracker] error:', err)
    res.status(500).json({ error: 'Failed to bulk delete' })
  }
})

module.exports = router
