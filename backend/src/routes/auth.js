const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { query } = require('../db')
const { verifyToken } = require('../middleware/auth')
const { auditLog } = require('../middleware/audit')

// POST /api/auth/register-workspace
// Creates workspace + first super_admin user
router.post('/register-workspace', async (req, res) => {
  const { workspaceName, username, password, fullName } = req.body

  if (!workspaceName || !username || !password || !fullName) {
    return res.status(400).json({ error: 'All fields are required' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  try {
    // Generate slug from workspace name
    const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now()

    // Check username uniqueness will be handled by DB constraint
    const passwordHash = await bcrypt.hash(password, 12)

    // Create workspace
    const wsResult = await query(
      `INSERT INTO workspaces (name, slug) VALUES ($1, $2) RETURNING *`,
      [workspaceName.trim(), slug]
    )
    const workspace = wsResult.rows[0]

    // Create super_admin user
    const userResult = await query(
      `INSERT INTO users (workspace_id, username, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'super_admin') RETURNING id, username, full_name, role, workspace_id`,
      [workspace.id, username.trim().toLowerCase(), passwordHash, fullName.trim()]
    )
    const user = userResult.rows[0]

    const token = jwt.sign(
      { id: user.id, workspaceId: workspace.id, role: user.role, username: user.username, fullName: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    )

    await auditLog({ workspaceId: workspace.id, userId: user.id, userName: user.full_name, action: 'create', entityType: 'workspace', entityId: workspace.id, entityName: workspace.name })

    res.status(201).json({ token, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role, workspaceId: workspace.id, workspaceName: workspace.name } })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists in this workspace' })
    console.error('Register workspace error:', err)
    res.status(500).json({ error: 'Server error during registration' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password, workspaceSlug } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' })
  }

  try {
    let userQuery, userParams

    if (workspaceSlug) {
      userQuery = `
        SELECT u.*, w.name as workspace_name, w.slug as workspace_slug
        FROM users u
        JOIN workspaces w ON w.id = u.workspace_id
        WHERE u.username = $1 AND w.slug = $2 AND u.is_active = TRUE`
      userParams = [username.trim().toLowerCase(), workspaceSlug]
    } else {
      userQuery = `
        SELECT u.*, w.name as workspace_name, w.slug as workspace_slug
        FROM users u
        JOIN workspaces w ON w.id = u.workspace_id
        WHERE u.username = $1 AND u.is_active = TRUE
        ORDER BY u.created_at ASC LIMIT 1`
      userParams = [username.trim().toLowerCase()]
    }

    const result = await query(userQuery, userParams)
    const user = result.rows[0]

    if (!user) return res.status(401).json({ error: 'Invalid username or password' })

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' })

    const token = jwt.sign(
      { id: user.id, workspaceId: user.workspace_id, role: user.role, username: user.username, fullName: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    )

    await auditLog({ workspaceId: user.workspace_id, userId: user.id, userName: user.full_name, action: 'login', entityType: 'user', entityId: user.id, entityName: user.full_name })

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        workspaceId: user.workspace_id,
        workspaceName: user.workspace_name,
        workspaceSlug: user.workspace_slug
      }
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Server error during login' })
  }
})

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.full_name, u.role, u.workspace_id, u.is_active,
              w.name as workspace_name, w.slug as workspace_slug
       FROM users u JOIN workspaces w ON w.id = u.workspace_id
       WHERE u.id = $1`,
      [req.user.id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' })
    const u = result.rows[0]
    res.json({ id: u.id, username: u.username, fullName: u.full_name, role: u.role, workspaceId: u.workspace_id, workspaceName: u.workspace_name, workspaceSlug: u.workspace_slug })
  } catch (err) {
    console.error('[auth] error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/auth/logout
router.post('/logout', verifyToken, async (req, res) => {
  await auditLog({ workspaceId: req.user.workspaceId, userId: req.user.id, userName: req.user.fullName, action: 'logout', entityType: 'user', entityId: req.user.id, entityName: req.user.fullName })
  res.json({ message: 'Logged out successfully' })
})

module.exports = router
