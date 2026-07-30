require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:4173', process.env.FRONTEND_URL].filter(Boolean),
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' })
})

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/users', require('./routes/users'))
app.use('/api/clients', require('./routes/clients'))
app.use('/api/projects', require('./routes/projects'))
app.use('/api/meetings', require('./routes/meetings'))
app.use('/api/action-items', require('./routes/actionItems'))
app.use('/api/tracker', require('./routes/tracker'))
app.use('/api/notifications', require('./routes/notifications'))
app.use('/api/dashboard', require('./routes/dashboard'))
app.use('/api/search', require('./routes/search'))
app.use('/api/audit', require('./routes/audit'))
app.use('/api/ai', require('./routes/ai'))

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`\n✅ Meeting Action Board API running on http://localhost:${PORT}`)
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`)
})
