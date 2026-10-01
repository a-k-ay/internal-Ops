const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { verifyToken, requirePMOrAbove, requireSuperAdmin } = require('../middleware/auth')
const { auditLog } = require('../middleware/audit')

// GET /api/clients
// GET /api/clients
router.get('/', verifyToken, async (req, res) => {
  const { includeArchived, memberId } = req.query
  try {
    let q
    const params = [req.user.workspaceId]

    // For member filtering: only return clients that have action items assigned to this member
    if (memberId) {
      q = `SELECT DISTINCT c.*, u.full_name as created_by_name,
                  COUNT(DISTINCT p.id) as project_count
           FROM clients c
           LEFT JOIN users u ON u.id = c.created_by
           LEFT JOIN projects p ON p.client_id = c.id
           INNER JOIN action_items a ON a.client_id = c.id AND a.assigned_to = $2
           WHERE c.workspace_id = $1 AND c.is_archived = FALSE
           GROUP BY c.id, u.full_name ORDER BY c.name ASC`
      params.push(memberId)
    } else {
      q = `SELECT c.*, u.full_name as created_by_name,
                  COUNT(DISTINCT p.id) as project_count
           FROM clients c
           LEFT JOIN users u ON u.id = c.created_by
           LEFT JOIN projects p ON p.client_id = c.id
           WHERE c.workspace_id = $1`
      if (!includeArchived || includeArchived === 'false') {
        q += ` AND c.is_archived = FALSE`
      }
      q += ` GROUP BY c.id, u.full_name ORDER BY c.is_archived ASC, c.name ASC`
    }

    const result = await query(q, params)
    res.json(result.rows)
  } catch (err) {
    console.error('[clients] error:', err)
    res.status(500).json({ error: 'Failed to fetch clients' })
  }
})

// GET /api/clients/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, w.name as workspace_name
       FROM clients c JOIN workspaces w ON w.id = c.workspace_id
       WHERE c.id = $1 AND c.workspace_id = $2`,
      [req.params.id, req.user.workspaceId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Client not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error('[clients] error:', err)
    res.status(500).json({ error: 'Failed to fetch client' })
  }
})

// POST /api/clients
router.post('/', verifyToken, requirePMOrAbove, async (req, res) => {
  const { name, projectName, contactPerson, contactEmail, contactPhone, industry } = req.body
  if (!name) return res.status(400).json({ error: 'Client name is required' })

  try {
    const result = await query(
      `INSERT INTO clients (workspace_id, name, project_name, contact_person, contact_email, contact_phone, industry, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.workspaceId, name.trim(), projectName || null, contactPerson || null, contactEmail || null, contactPhone || null, industry || null, req.user.id]
    )
    const client = result.rows[0]
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'create', entityType: 'client', entityId: client.id, entityName: client.name })
    res.status(201).json(client)
  } catch (err) {
    console.error('[clients] error:', err)
    res.status(500).json({ error: 'Failed to create client' })
  }
})

// PUT /api/clients/:id
router.put('/:id', verifyToken, requirePMOrAbove, async (req, res) => {
  const { name, projectName, contactPerson, contactEmail, contactPhone, industry } = req.body
  try {
    const result = await query(
      `UPDATE clients SET name = $1, project_name = $2, contact_person = $3, contact_email = $4,
              contact_phone = $5, industry = $6, updated_at = NOW()
       WHERE id = $7 AND workspace_id = $8 RETURNING *`,
      [name, projectName || null, contactPerson || null, contactEmail || null, contactPhone || null, industry || null, req.params.id, req.user.workspaceId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Client not found' })
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'update', entityType: 'client', entityId: req.params.id, entityName: name })
    res.json(result.rows[0])
  } catch (err) {
    console.error('[clients] error:', err)
    res.status(500).json({ error: 'Failed to update client' })
  }
})

// PUT /api/clients/:id/archive
router.put('/:id/archive', verifyToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await query(
      `UPDATE clients SET is_archived = TRUE, archived_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2 RETURNING *`,
      [req.params.id, req.user.workspaceId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Client not found' })
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'archive', entityType: 'client', entityId: req.params.id, entityName: result.rows[0].name })
    res.json(result.rows[0])
  } catch (err) {
    console.error('[clients] error:', err)
    res.status(500).json({ error: 'Failed to archive client' })
  }
})

// PUT /api/clients/:id/restore
router.put('/:id/restore', verifyToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await query(
      `UPDATE clients SET is_archived = FALSE, archived_at = NULL, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2 RETURNING *`,
      [req.params.id, req.user.workspaceId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Client not found' })
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'restore', entityType: 'client', entityId: req.params.id, entityName: result.rows[0].name })
    res.json(result.rows[0])
  } catch (err) {
    console.error('[clients] error:', err)
    res.status(500).json({ error: 'Failed to restore client' })
  }
})

// DELETE /api/clients/:id — super_admin only (permanent delete)
router.delete('/:id', verifyToken, requireSuperAdmin, async (req, res) => {
  try {
    const client = await query(`SELECT name FROM clients WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user.workspaceId])
    if (!client.rows[0]) return res.status(404).json({ error: 'Client not found' })
    await query(`DELETE FROM clients WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user.workspaceId])
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'delete', entityType: 'client', entityId: req.params.id, entityName: client.rows[0].name })
    res.json({ message: 'Client deleted' })
  } catch (err) {
    console.error('[clients] error:', err)
    res.status(500).json({ error: 'Failed to delete client' })
  }
})

module.exports = router
