const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { verifyToken, requirePMOrAbove } = require('../middleware/auth')
const { auditLog } = require('../middleware/audit')

// GET /api/projects?clientId=xxx
router.get('/', verifyToken, async (req, res) => {
  const { clientId } = req.query
  try {
    let q = `SELECT p.*, c.name as client_name,
                    COUNT(DISTINCT m.id) as meeting_count,
                    COUNT(DISTINCT t.id) as tracker_count
             FROM projects p
             LEFT JOIN clients c ON c.id = p.client_id
             LEFT JOIN meetings m ON m.project_id = p.id
             LEFT JOIN tracker_items t ON t.project_id = p.id
             WHERE p.workspace_id = $1`
    const params = [req.user.workspaceId]
    if (clientId) {
      q += ` AND p.client_id = $2`
      params.push(clientId)
    }
    q += ` GROUP BY p.id, c.name ORDER BY p.created_at DESC`
    const result = await query(q, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' })
  }
})

// GET /api/projects/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, c.name as client_name, c.is_archived as client_archived
       FROM projects p JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1 AND p.workspace_id = $2`,
      [req.params.id, req.user.workspaceId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Project not found' })
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project' })
  }
})

// POST /api/projects
router.post('/', verifyToken, requirePMOrAbove, async (req, res) => {
  const { clientId, name, description } = req.body
  if (!clientId || !name) return res.status(400).json({ error: 'Client and project name are required' })

  try {
    const result = await query(
      `INSERT INTO projects (workspace_id, client_id, name, description, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.workspaceId, clientId, name.trim(), description || null, req.user.id]
    )
    const project = result.rows[0]
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'create', entityType: 'project', entityId: project.id, entityName: project.name })
    res.status(201).json(project)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project' })
  }
})

// PUT /api/projects/:id
router.put('/:id', verifyToken, requirePMOrAbove, async (req, res) => {
  const { name, description, status } = req.body
  try {
    const result = await query(
      `UPDATE projects SET name = $1, description = $2, status = $3, updated_at = NOW()
       WHERE id = $4 AND workspace_id = $5 RETURNING *`,
      [name, description || null, status || 'active', req.params.id, req.user.workspaceId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Project not found' })
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'update', entityType: 'project', entityId: req.params.id, entityName: name })
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to update project' })
  }
})

// DELETE /api/projects/:id
router.delete('/:id', verifyToken, requirePMOrAbove, async (req, res) => {
  try {
    const proj = await query(`SELECT name FROM projects WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user.workspaceId])
    if (!proj.rows[0]) return res.status(404).json({ error: 'Project not found' })
    await query(`DELETE FROM projects WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user.workspaceId])
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'delete', entityType: 'project', entityId: req.params.id, entityName: proj.rows[0].name })
    res.json({ message: 'Project deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project' })
  }
})

module.exports = router
