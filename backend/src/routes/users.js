const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const { query } = require('../db')
const { verifyToken, requireSuperAdmin, requirePMOrAbove } = require('../middleware/auth')
const { auditLog } = require('../middleware/audit')

// GET /api/users - list all users in workspace
router.get('/', verifyToken, requirePMOrAbove, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, full_name, role, is_active, created_at
       FROM users WHERE workspace_id = $1 ORDER BY created_at ASC`,
      [req.user.workspaceId]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('[users] error:', err)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// POST /api/users - super admin creates a new user
router.post('/', verifyToken, requireSuperAdmin, async (req, res) => {
  const { username, password, fullName, role } = req.body

  if (!username || !password || !fullName || !role) {
    return res.status(400).json({ error: 'All fields required' })
  }

  if (!['pm', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Role must be pm or member' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const result = await query(
      `INSERT INTO users (workspace_id, username, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, full_name, role, is_active, created_at`,
      [req.user.workspaceId, username.trim().toLowerCase(), passwordHash, fullName.trim(), role]
    )
    const newUser = result.rows[0]
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'create', entityType: 'user', entityId: newUser.id, entityName: newUser.full_name })
    res.status(201).json(newUser)
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' })
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// PUT /api/users/profile/me - update own profile (must be BEFORE /:id to avoid conflict)
router.put('/profile/me', verifyToken, async (req, res) => {
  const { fullName, currentPassword, newPassword } = req.body

  try {
    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password required' })
      const userResult = await query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id])
      const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash)
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })
      if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' })
      const passwordHash = await bcrypt.hash(newPassword, 12)
      await query(`UPDATE users SET full_name = $1, password_hash = $2, updated_at = NOW() WHERE id = $3`, [fullName, passwordHash, req.user.id])
    } else {
      await query(`UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2`, [fullName, req.user.id])
    }
    res.json({ message: 'Profile updated successfully' })
  } catch (err) {
    console.error('[users] error:', err)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// PUT /api/users/:id - update user
router.put('/:id', verifyToken, requireSuperAdmin, async (req, res) => {
  const { fullName, username, role, password } = req.body
  const userId = req.params.id

  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' })
  }

  try {
    // Cannot change own role
    if (userId === req.user.id && role && role !== req.user.role) {
      return res.status(400).json({ error: 'Cannot change your own role' })
    }

    const normalizedUsername = username.trim().toLowerCase()

    let updateQuery, updateParams
    if (password && password.length >= 6) {
      const passwordHash = await bcrypt.hash(password, 12)
      updateQuery = `UPDATE users SET full_name = $1, username = $2, role = $3, password_hash = $4, updated_at = NOW()
                     WHERE id = $5 AND workspace_id = $6 RETURNING id, username, full_name, role, is_active`
      updateParams = [fullName, normalizedUsername, role, passwordHash, userId, req.user.workspaceId]
    } else {
      updateQuery = `UPDATE users SET full_name = $1, username = $2, role = $3, updated_at = NOW()
                     WHERE id = $4 AND workspace_id = $5 RETURNING id, username, full_name, role, is_active`
      updateParams = [fullName, normalizedUsername, role, userId, req.user.workspaceId]
    }

    const result = await query(updateQuery, updateParams)
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' })
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'update', entityType: 'user', entityId: userId, entityName: fullName })
    res.json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' })
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// PUT /api/users/:id/toggle-active - activate/deactivate
router.put('/:id/toggle-active', verifyToken, requireSuperAdmin, async (req, res) => {
  const userId = req.params.id
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot deactivate yourself' })

  try {
    const result = await query(
      `UPDATE users SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2 RETURNING id, username, full_name, role, is_active`,
      [userId, req.user.workspaceId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error('[users] error:', err)
    res.status(500).json({ error: 'Failed to toggle user status' })
  }
})

// DELETE /api/users/:id
router.delete('/:id', verifyToken, requireSuperAdmin, async (req, res) => {
  const userId = req.params.id
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' })

  try {
    // Nullify all FK references to this user before deleting to avoid constraint violations
    await query(`UPDATE action_items SET assigned_to = NULL WHERE assigned_to = $1 AND workspace_id = $2`, [userId, req.user.workspaceId])
    await query(`UPDATE action_items SET created_by = NULL WHERE created_by = $1 AND workspace_id = $2`, [userId, req.user.workspaceId])
    await query(`UPDATE tracker_items SET created_by = NULL WHERE created_by = $1 AND workspace_id = $2`, [userId, req.user.workspaceId])
    await query(`UPDATE meetings SET created_by = NULL WHERE created_by = $1 AND workspace_id = $2`, [userId, req.user.workspaceId])
    await query(`UPDATE clients SET created_by = NULL WHERE created_by = $1 AND workspace_id = $2`, [userId, req.user.workspaceId])
    await query(`UPDATE projects SET created_by = NULL WHERE created_by = $1 AND workspace_id = $2`, [userId, req.user.workspaceId])
    // tracker_shares has no workspace_id — filter by user id only
    await query(`DELETE FROM tracker_shares WHERE shared_with_user_id = $1 OR created_by = $1`, [userId])

    await query(`DELETE FROM users WHERE id = $1 AND workspace_id = $2`, [userId, req.user.workspaceId])
    await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'delete', entityType: 'user', entityId: userId })
    res.json({ message: 'User deleted' })
  } catch (err) {
    console.error('Delete user error:', err.message)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

module.exports = router
