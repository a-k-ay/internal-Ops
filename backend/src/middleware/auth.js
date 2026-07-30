const jwt = require('jsonwebtoken')

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired, please login again' })
    }
    return res.status(403).json({ error: 'Invalid token' })
  }
}

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

const requireSuperAdmin = requireRole('super_admin')
const requirePMOrAbove = requireRole('super_admin', 'pm')

module.exports = { verifyToken, requireRole, requireSuperAdmin, requirePMOrAbove }
