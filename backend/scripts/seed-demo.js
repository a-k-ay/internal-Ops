// Seed script: populates a "Demo Workspace" with realistic fake data so a
// public demo URL isn't empty on first visit.
//
// Usage:
//   cd backend
//   node scripts/seed-demo.js            # creates demo-workspace if missing
//   node scripts/seed-demo.js --reset    # drops and recreates
//
// Demo credentials (printed at the end of a successful run too):
//   workspace slug: demo
//   admin / demo1234    (super_admin)
//   pm    / demo1234    (project manager)
//   dev   / demo1234    (member)
//
// This script connects directly to the DB via the same pool as the API —
// make sure backend/.env has DATABASE_URL set before running.

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const bcrypt = require('bcryptjs')
const { pool, query } = require('../src/db')

const RESET = process.argv.includes('--reset')

const todayShift = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function run() {
  console.log(RESET ? '-> reset mode: dropping existing demo workspace' : '-> seed mode: creating if missing')

  // 1. Workspace -----------------------------------------------------------
  if (RESET) {
    await query(`DELETE FROM workspaces WHERE slug LIKE 'demo%'`)
  }

  const existing = await query(`SELECT id FROM workspaces WHERE slug = 'demo'`)
  if (existing.rows[0] && !RESET) {
    console.log(`workspace 'demo' already exists at id ${existing.rows[0].id}; pass --reset to recreate`)
    process.exit(0)
  }

  const ws = (await query(
    `INSERT INTO workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
    ['Demo Workspace', 'demo']
  )).rows[0]
  console.log(`workspace demo id=${ws.id}`)

  // 2. Users ---------------------------------------------------------------
  const pw = await bcrypt.hash('demo1234', 12)
  const users = {}
  for (const [username, fullName, role] of [
    ['admin', 'Avery Lee',      'super_admin'],
    ['pm',    'Priya Nair',     'pm'],
    ['dev',   'Dev Suresh',     'member'],
    ['sara',  'Sara Hamilton',  'member'],
    ['raj',   'Raj Verma',      'member'],
  ]) {
    const r = await query(
      `INSERT INTO users (workspace_id, username, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [ws.id, username, pw, fullName, role]
    )
    users[username] = r.rows[0].id
  }
  console.log(`users: ${Object.keys(users).length}`)

  // 3. Clients + projects --------------------------------------------------
  const clients = {}
  for (const [key, name, project, industry] of [
    ['acme',    'Acme Logistics',        'Fleet Tracker Rebuild', 'Logistics'],
    ['beacon',  'Beacon Health',         'Patient Portal v2',     'Healthcare'],
    ['vertex',  'Vertex Education',      'Student Dashboard',     'EdTech'],
  ]) {
    const c = (await query(
      `INSERT INTO clients (workspace_id, name, project_name, contact_person, contact_email, industry, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [ws.id, name, project, 'Primary Contact', `contact@${key}.example`, industry, users.pm]
    )).rows[0]
    const p = (await query(
      `INSERT INTO projects (workspace_id, client_id, name, description, status, created_by)
       VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id`,
      [ws.id, c.id, project, `Primary engagement with ${name}.`, users.pm]
    )).rows[0]
    clients[key] = { clientId: c.id, projectId: p.id }
  }
  console.log(`clients: ${Object.keys(clients).length} (each with one project)`)

  // 4. Meetings ------------------------------------------------------------
  const meetings = []
  const meetingDefs = [
    // [clientKey, title, dateOffsetDays, discussionPoints]
    ['acme',   'Kickoff — scope + timeline',  -21,
      'Walked through the architecture doc. Agreed to a two-phase delivery: driver app first, admin console second. Open question on realtime GPS cost per vehicle; Sara to spike.'],
    ['acme',   'Sprint 1 review',             -7,
      'Driver app shell is on-device. Still waiting on API keys for the mapping provider. Priya will chase procurement by Friday.'],
    ['beacon', 'Compliance walkthrough',     -14,
      'Legal walked us through HIPAA requirements for the new portal. Access logs, encryption at rest, 30-min idle timeout. Need to budget two sprints for the audit trail work.'],
    ['beacon', 'UX review — appointment flow', -3,
      'Current prototype breaks on tablet landscape. Design team will revise and share Monday. Dev to pause front-end integration until then.'],
    ['vertex', 'Roadmap refinement',          -10,
      'Reprioritised the backlog. Grade import tool is now ahead of SSO. Raj will own the import tool; needs sample files from Vertex IT.'],
    ['vertex', 'Weekly sync',                 -1,
      'SSO config stuck on IdP metadata. Vertex side chasing their IT. Not a blocker this sprint but will be next week.'],
  ]
  for (const [key, title, dayOff, notes] of meetingDefs) {
    const { clientId, projectId } = clients[key]
    const m = (await query(
      `INSERT INTO meetings (workspace_id, project_id, client_id, title, date, attendees, venue, duration, objective, discussion_points, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [ws.id, projectId, clientId, title, todayShift(dayOff),
       'Priya Nair, Dev Suresh, Sara Hamilton',
       'Google Meet', '45 min', title.split('—')[0]?.trim() || title, notes, users.pm]
    )).rows[0]
    meetings.push({ ...clients[key], meetingId: m.id, dayOff })
  }
  console.log(`meetings: ${meetings.length}`)

  // 5. Action items (mix of statuses, due dates in past/future) ------------
  const assignees = ['dev', 'sara', 'raj']
  const actionDefs = [
    // [meetingIndex, title, assigneeKey, dueOffset, status]
    [0, 'Spike GPS cost per vehicle',          'sara', -14, 'closed'],
    [0, 'Share Phase 2 scoping doc',            'pm',  -10, 'closed'],
    [1, 'Chase mapping API keys with procurement', 'pm', -3,  'in_progress'],
    [1, 'Driver app: add offline queue',        'dev', +4,  'in_progress'],
    [1, 'QA script for sprint 1',               'raj', -2,  'in_progress'],
    [2, 'Draft audit-trail schema',             'sara', -7,  'closed'],
    [2, 'Budget two sprints for compliance work','pm',  -5,  'closed'],
    [3, 'Revise tablet landscape wireframe',    'sara', +2,  'open'],
    [3, 'Pause portal front-end integration',   'dev', 0,    'in_progress'],
    [4, 'Request sample grade files from Vertex IT','raj', -1, 'open'],
    [4, 'Build grade import tool v0',           'raj', +10, 'open'],
    [5, 'Follow up on IdP metadata',            'pm',  +3,  'open'],
    [5, 'Prepare SSO integration branch',       'dev', +7,  'open'],
    [1, 'Overdue: fix driver login',            'dev', -4,  'open'],   // intentionally overdue
    [4, 'Overdue: write release notes template', 'raj', -6,  'open'],   // overdue
  ]
  for (const [i, title, who, dueOff, status] of actionDefs) {
    const m = meetings[i]
    await query(
      `INSERT INTO action_items (workspace_id, meeting_id, project_id, client_id, title, assigned_to, assigned_to_name, due_date, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [ws.id, m.meetingId, m.projectId, m.clientId, title,
       users[who], who === 'pm' ? 'Priya Nair' : (who === 'dev' ? 'Dev Suresh' : who === 'sara' ? 'Sara Hamilton' : 'Raj Verma'),
       todayShift(dueOff), status, users.pm]
    )
  }
  console.log(`action items: ${actionDefs.length}`)

  // 6. Tracker items -------------------------------------------------------
  const trackerDefs = [
    // [clientKey, description, classification, status, raisedOff, raisedBy, remarks]
    ['acme',   'Driver app crashes on first launch on Android 11', 'issue',           'closed',      -20, 'Priya Nair',   'Reproduced locally; hotfix in 1.0.2.'],
    ['acme',   'Add weekly fuel usage report to admin console',    'new_requirement', 'in_progress', -8,  'Priya Nair',   'Design in review.'],
    ['acme',   'Change delivery status wording from "Done" to "Delivered"', 'change_request', 'closed', -15, 'Client PM',  'Ship in sprint 2.'],
    ['beacon', 'Session timeout triggers mid-form, data lost',     'issue',           'pending',      -4, 'Dev Suresh',   'Need to add draft-save before shipping.'],
    ['beacon', 'HIPAA audit log export (CSV + JSON)',              'new_requirement', 'in_progress', -14, 'Priya Nair',   'Blocked on schema sign-off from Legal.'],
    ['beacon', 'Tooltip copy should match terminology sheet',      'change_request', 'closed',      -9,  'Client PM',    'Shipped with 1.4.'],
    ['beacon', 'Appointment confirm email: wrong timezone',        'issue',          'in_progress', -1,  'Sara Hamilton','Localise against patient profile tz.'],
    ['vertex', 'Grade import: CSV with semicolons silently fails', 'issue',          'pending',     -5,  'Raj Verma',    'Add delimiter detection.'],
    ['vertex', 'Add bulk student invite (up to 500 per upload)',   'new_requirement','pending',     -2,  'Client PM',    'Scoping; needs rate-limit guard.'],
    ['vertex', 'Reword Dashboard "GPA" to "Marks"',                'change_request', 'closed',      -11, 'Client PM',    'Done in locale file.'],
    ['vertex', 'SSO metadata URL to be confirmed',                 'tbd',            'pending',      0,  'Priya Nair',   'Awaiting IdP admin.'],
  ]
  for (const [key, description, classification, status, raisedOff, raisedBy, remarks] of trackerDefs) {
    const { clientId, projectId } = clients[key]
    await query(
      `INSERT INTO tracker_items (workspace_id, project_id, client_id, description, classification, status, raised_date, raised_by, remarks, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [ws.id, projectId, clientId, description, classification, status, todayShift(raisedOff), raisedBy, remarks, users.pm]
    )
  }
  console.log(`tracker items: ${trackerDefs.length}`)

  // 7. One nice meeting summary so the AI section looks populated ----------
  await query(
    `UPDATE meetings SET ai_summary = $1 WHERE id = $2`,
    [
      [
        'EXECUTIVE SUMMARY',
        'Sprint 1 of the Fleet Tracker rebuild reviewed. The driver app shell is on-device and functional, but the mapping provider API keys are still blocked in procurement.',
        '',
        'KEY DISCUSSIONS',
        '1. Driver app shell deployed to internal devices for smoke testing.',
        '2. Mapping provider onboarding stalled at procurement for 6 days.',
        '3. Offline queue work scoped for next sprint.',
        '',
        'KEY DECISIONS',
        '1. Priya to escalate procurement by Friday.',
        '2. Hold phase-2 planning until keys are confirmed.',
      ].join('\n'),
      meetings[1].meetingId,
    ]
  )

  console.log('\nSeed complete.')
  console.log('Workspace slug: demo')
  console.log('Login as: admin / pm / dev / sara / raj   (password: demo1234)')

  await pool.end()
}

run().catch(async (err) => {
  console.error('Seed failed:', err)
  await pool.end()
  process.exit(1)
})
