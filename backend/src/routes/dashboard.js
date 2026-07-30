const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { verifyToken } = require('../middleware/auth')

// GET /api/dashboard - global KPIs
router.get('/', verifyToken, async (req, res) => {
  const wid = req.user.workspaceId
  try {
    const [
      activeClients,
      openActions,
      overdueActions,
      meetingsThisMonth,
      meetingsThisWeek,
      trackerByStatus,
      trackerByClass,
      recentMeetings,
      upcomingDueDates
    ] = await Promise.all([
      // Total active clients
      query(`SELECT COUNT(*) as count FROM clients WHERE workspace_id = $1 AND is_archived = FALSE`, [wid]),
      // Open action items
      query(`SELECT COUNT(*) as count FROM action_items WHERE workspace_id = $1 AND status IN ('open','in_progress')`, [wid]),
      // Overdue action items
      query(`SELECT COUNT(*) as count FROM action_items WHERE workspace_id = $1 AND due_date < CURRENT_DATE AND status NOT IN ('closed')`, [wid]),
      // Meetings this month
      query(`SELECT COUNT(*) as count FROM meetings WHERE workspace_id = $1 AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)`, [wid]),
      // Meetings this week
      query(`SELECT COUNT(*) as count FROM meetings WHERE workspace_id = $1 AND date >= date_trunc('week', CURRENT_DATE) AND date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'`, [wid]),
      // Tracker by status
      query(`SELECT status, COUNT(*) as count FROM tracker_items WHERE workspace_id = $1 GROUP BY status`, [wid]),
      // Tracker by classification
      query(`SELECT classification, COUNT(*) as count FROM tracker_items WHERE workspace_id = $1 GROUP BY classification`, [wid]),
      // Recent meetings (last 5)
      query(`SELECT m.id, m.title, m.date, c.name as client_name, p.name as project_name FROM meetings m LEFT JOIN clients c ON c.id = m.client_id LEFT JOIN projects p ON p.id = m.project_id WHERE m.workspace_id = $1 ORDER BY m.date DESC LIMIT 5`, [wid]),
      // Upcoming due dates (next 7 days)
      query(`SELECT a.id, a.title, a.due_date, a.status, a.assigned_to_name, c.name as client_name FROM action_items a LEFT JOIN clients c ON c.id = a.client_id WHERE a.workspace_id = $1 AND a.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND a.status NOT IN ('closed') ORDER BY a.due_date ASC LIMIT 10`, [wid])
    ])

    res.json({
      totalActiveClients: parseInt(activeClients.rows[0].count),
      openActionItems: parseInt(openActions.rows[0].count),
      overdueActionItems: parseInt(overdueActions.rows[0].count),
      meetingsThisMonth: parseInt(meetingsThisMonth.rows[0].count),
      meetingsThisWeek: parseInt(meetingsThisWeek.rows[0].count),
      trackerByStatus: trackerByStatus.rows,
      trackerByClassification: trackerByClass.rows,
      recentMeetings: recentMeetings.rows,
      upcomingDueDates: upcomingDueDates.rows
    })
  } catch (err) {
    console.error('Dashboard error:', err)
    res.status(500).json({ error: 'Failed to fetch dashboard data' })
  }
})

// GET /api/dashboard/client/:clientId - per client KPIs
router.get('/client/:clientId', verifyToken, async (req, res) => {
  const wid = req.user.workspaceId
  const cid = req.params.clientId
  try {
    const [openActions, overdueActions, trackerByStatus, trackerByClass, upcomingDue] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM action_items WHERE workspace_id = $1 AND client_id = $2 AND status IN ('open','in_progress')`, [wid, cid]),
      query(`SELECT COUNT(*) as count FROM action_items WHERE workspace_id = $1 AND client_id = $2 AND due_date < CURRENT_DATE AND status NOT IN ('closed')`, [wid, cid]),
      query(`SELECT status, COUNT(*) as count FROM tracker_items WHERE workspace_id = $1 AND client_id = $2 GROUP BY status`, [wid, cid]),
      query(`SELECT classification, COUNT(*) as count FROM tracker_items WHERE workspace_id = $1 AND client_id = $2 GROUP BY classification`, [wid, cid]),
      query(`SELECT a.id, a.title, a.due_date, a.status, a.assigned_to_name FROM action_items a WHERE a.workspace_id = $1 AND a.client_id = $2 AND a.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND a.status NOT IN ('closed') ORDER BY a.due_date ASC LIMIT 10`, [wid, cid])
    ])
    res.json({
      openActionItems: parseInt(openActions.rows[0].count),
      overdueActionItems: parseInt(overdueActions.rows[0].count),
      trackerByStatus: trackerByStatus.rows,
      trackerByClassification: trackerByClass.rows,
      upcomingDueDates: upcomingDue.rows
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch client dashboard' })
  }
})

module.exports = router
