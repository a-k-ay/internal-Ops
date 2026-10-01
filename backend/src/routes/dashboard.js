const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { verifyToken } = require('../middleware/auth')

// GET /api/dashboard - global KPIs (shows different data based on user role)
router.get('/', verifyToken, async (req, res) => {
  // Dashboard is user-specific and changes constantly; never let a browser
  // or intermediary cache a snapshot of it.
  res.set('Cache-Control', 'no-store')
  const wid = req.user.workspaceId
  const uid = req.user.id
  const userRole = req.user.role

  try {
    // For members, show task-focused dashboard (filtered by assigned_to user)
    if (userRole === 'member') {
      const [
        myOpenTasks,
        myDueThisWeek,
        myOverdueTasks,
        myCompletedThisMonth,
        tasksByStatus,
        tasksByClassification,
        upcomingTasks,
        tasksDueSoon
      ] = await Promise.all([
        // My assigned open tasks
        query(`SELECT COUNT(*)::int as count FROM action_items WHERE workspace_id = $1 AND assigned_to = $2 AND status IN ('open','in_progress')`, [wid, uid]),
        // Due this week
        query(`SELECT COUNT(*)::int as count FROM action_items WHERE workspace_id = $1 AND assigned_to = $2 AND due_date >= CURRENT_DATE AND due_date < CURRENT_DATE + INTERVAL '7 days'`, [wid, uid]),
        // Overdue tasks (assigned to me, not closed)
        query(`SELECT COUNT(*)::int as count FROM action_items WHERE workspace_id = $1 AND assigned_to = $2 AND due_date < CURRENT_DATE AND status NOT IN ('closed')`, [wid, uid]),
        // Completed this month (assigned to me)
        query(`SELECT COUNT(*)::int as count FROM action_items WHERE workspace_id = $1 AND assigned_to = $2 AND status = 'closed' AND date_trunc('month', updated_at) = date_trunc('month', CURRENT_DATE)`, [wid, uid]),
        // Tasks by status (assigned to me) — parseInt count from postgres string
        query(`SELECT status, COUNT(*)::int as count FROM action_items WHERE workspace_id = $1 AND assigned_to = $2 GROUP BY status ORDER BY status`, [wid, uid]),
        // Tasks by project (assigned to me)
        query(`SELECT COALESCE(p.name, 'No Project') as project, COUNT(*)::int as count FROM action_items a LEFT JOIN meetings m ON m.id = a.meeting_id LEFT JOIN projects p ON p.id = m.project_id WHERE a.workspace_id = $1 AND a.assigned_to = $2 GROUP BY p.name ORDER BY count DESC LIMIT 10`, [wid, uid]),
        // Upcoming tasks (next 7 days, assigned to me)
        query(`SELECT a.id, a.title, a.due_date, a.status, c.name as client_name FROM action_items a LEFT JOIN clients c ON c.id = a.client_id WHERE a.workspace_id = $1 AND a.assigned_to = $2 AND a.due_date >= CURRENT_DATE AND a.due_date <= CURRENT_DATE + INTERVAL '7 days' ORDER BY a.due_date ASC LIMIT 5`, [wid, uid]),
        // Tasks due soon (next 14 days, assigned to me, not closed)
        query(`SELECT a.id, a.title, a.due_date, a.status, c.name as client_name FROM action_items a LEFT JOIN clients c ON c.id = a.client_id WHERE a.workspace_id = $1 AND a.assigned_to = $2 AND a.due_date >= CURRENT_DATE AND a.due_date <= CURRENT_DATE + INTERVAL '14 days' AND a.status NOT IN ('closed') ORDER BY a.due_date ASC LIMIT 8`, [wid, uid])
      ])

      return res.json({
        isMemberDashboard: true,
        myOpenTasks: parseInt(myOpenTasks.rows[0].count),
        myDueThisWeek: parseInt(myDueThisWeek.rows[0].count),
        myOverdueTasks: parseInt(myOverdueTasks.rows[0].count),
        myCompletedThisMonth: parseInt(myCompletedThisMonth.rows[0].count),
        tasksByStatus: tasksByStatus.rows,
        tasksByClassification: tasksByClassification.rows,
        upcomingTasks: upcomingTasks.rows,
        tasksDueSoon: tasksDueSoon.rows
      })
    }

    // For PM/Admin, show workspace-wide dashboard
    const [
      activeClients,
      activeProjects,
      totalActions,
      openActions,
      overdueActions,
      meetingsThisMonth,
      meetingsThisWeek,
      trackerByStatus,
      trackerByClass,
      recentMeetings,
      upcomingDueDates,
      teamWorkload
    ] = await Promise.all([
      // Total active clients
      query(`SELECT COUNT(*) as count FROM clients WHERE workspace_id = $1 AND is_archived = FALSE`, [wid]),
      // Active projects (projects under non-archived clients)
      query(`SELECT COUNT(*) as count FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.workspace_id = $1 AND c.is_archived = FALSE`, [wid]),
      // Total action items (for progress ratio on the Open tile)
      query(`SELECT COUNT(*) as count FROM action_items WHERE workspace_id = $1`, [wid]),
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
      query(`SELECT a.id, a.title, a.due_date, a.status, a.assigned_to_name, c.name as client_name FROM action_items a LEFT JOIN clients c ON c.id = a.client_id WHERE a.workspace_id = $1 AND a.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND a.status NOT IN ('closed') ORDER BY a.due_date ASC LIMIT 10`, [wid]),
      // Team workload — per-member counts across statuses (only members with at least one item)
      query(
        `SELECT u.id as user_id,
                u.full_name,
                COUNT(a.*)::int AS total,
                COUNT(*) FILTER (WHERE a.status = 'open')::int AS open_count,
                COUNT(*) FILTER (WHERE a.status = 'in_progress')::int AS in_progress_count,
                COUNT(*) FILTER (WHERE a.status = 'closed')::int AS closed_count,
                COUNT(*) FILTER (WHERE a.due_date < CURRENT_DATE AND a.status <> 'closed')::int AS overdue_count,
                -- Postgres has no MAX(uuid). Cast to text so GROUP BY has
                -- a definable aggregate; the exact pick is 'any one of them',
                -- which is what the frontend uses it for (pre-selecting a filter).
                MAX(a.client_id::text)::uuid AS any_client_id,
                MAX(a.project_id::text)::uuid AS any_project_id
         FROM users u
         LEFT JOIN action_items a
           ON a.assigned_to = u.id AND a.workspace_id = u.workspace_id
         WHERE u.workspace_id = $1 AND u.is_active = TRUE
         GROUP BY u.id, u.full_name
         HAVING COUNT(a.*) > 0
         ORDER BY total DESC`,
        [wid]
      )
    ])

    // For the Team Workload filters (client + project chained), send the assignments so the frontend can filter without extra roundtrips
    const teamAssignments = await query(
      `SELECT a.assigned_to as user_id, a.client_id, a.project_id, a.status,
              (a.due_date < CURRENT_DATE AND a.status <> 'closed') AS is_overdue
       FROM action_items a
       WHERE a.workspace_id = $1 AND a.assigned_to IS NOT NULL`,
      [wid]
    )

    // Client/project options for the workload filter
    const [clientOptions, projectOptions] = await Promise.all([
      query(`SELECT id, name FROM clients WHERE workspace_id = $1 AND is_archived = FALSE ORDER BY name`, [wid]),
      query(`SELECT id, name, client_id FROM projects WHERE workspace_id = $1 ORDER BY name`, [wid])
    ])

    res.json({
      isMemberDashboard: false,
      totalActiveClients: parseInt(activeClients.rows[0].count),
      activeProjects: parseInt(activeProjects.rows[0].count),
      totalActionItems: parseInt(totalActions.rows[0].count),
      openActionItems: parseInt(openActions.rows[0].count),
      overdueActionItems: parseInt(overdueActions.rows[0].count),
      meetingsThisMonth: parseInt(meetingsThisMonth.rows[0].count),
      meetingsThisWeek: parseInt(meetingsThisWeek.rows[0].count),
      trackerByStatus: trackerByStatus.rows,
      trackerByClassification: trackerByClass.rows,
      recentMeetings: recentMeetings.rows,
      upcomingDueDates: upcomingDueDates.rows,
      teamWorkload: teamWorkload.rows,
      teamAssignments: teamAssignments.rows,
      clientOptions: clientOptions.rows,
      projectOptions: projectOptions.rows
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
    console.error('[dashboard] error:', err)
    res.status(500).json({ error: 'Failed to fetch client dashboard' })
  }
})

module.exports = router
