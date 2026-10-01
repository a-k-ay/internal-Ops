# Meeting Action Board

An internal operations tool for small services teams: capture meeting
minutes, extract action items, and track the work that comes out of them
in one place instead of across chat threads, email, and separate docs.

Built for a real team that was losing track of change requests between
WhatsApp, email, and Google Docs. Tested with that team before writing
this README.

## Problem

When a services team meets with a client, three things happen:

1. **Someone types notes.** They end up as a Google Doc or a page in
   someone's notebook. A week later nobody knows which one is the real one.
2. **Someone agrees to do something.** The action is in the notes
   somewhere. Who owns it, by when, and whether it's done — not clear.
3. **The client raises an issue after the meeting.** On WhatsApp. By
   email. Verbally. No ticket, no history, no accountability.

The result is the familiar failure mode: the team argues about what was
agreed, the PM re-asks the client, the client re-sends the same request,
and nothing ships on time.

This app replaces the Google Doc with structured meeting records,
auto-extracts action items from the notes with an LLM, and gives each
project a tracker where issues/change requests/new requirements live
with a status and an audit trail.

## How it's used

Three roles, intentionally simple:

- **Super Admin** — creates the workspace, manages users and roles.
- **PM** — creates clients and projects, logs meetings, approves and
  assigns action items, moves items into the project tracker.
- **Member** — sees only what's assigned to them; updates status on
  their own tasks.

Typical flow:

1. PM creates a meeting under a client/project, pastes raw notes.
2. The AI (Gemini) produces a formatted MoM summary and a JSON list of
   extracted action items. The PM reviews, edits, and assigns them.
3. When an action item needs engineering follow-through, the PM promotes
   it into the tracker. The tracker item and the action item stay
   linked, and tracker status changes sync back to the action item
   (one-way, deliberately — see Design notes below).
4. Members see their queue on the dashboard, update as they work.
5. Audit log captures every create/update/delete for later lookup.

## Tech

**Frontend** — React 19 + Vite + React Router. No Redux; `AuthContext`
holds the session, each page owns its own data fetching. Styling is
plain CSS with CSS variables for the design tokens (`src/index.css`).
Icons from `lucide-react`, date math from `date-fns`.

**Backend** — Node + Express 4 as a thin API, `pg` directly (no ORM),
JWT in the `Authorization` header, bcrypt for password hashes. Twelve
route files, one middleware for `verifyToken` + `requireRole`, one each
for audit logging and in-app notifications.

**Database** — Neon Postgres. Nine tables, `workspace_id` as the tenant
boundary on every row. See [`backend/schema.sql`](backend/schema.sql).

**AI** — Google Gemini via `generativelanguage.googleapis.com` for MoM
summarization and action-item extraction (`backend/src/routes/ai.js`).

## Design notes

A few decisions worth calling out, since the "why" is more interesting
than the "what":

- **Multi-tenancy is enforced in SQL, not in middleware.** Every query
  — read and write — carries `WHERE workspace_id = $1`. A middleware
  check is one line to forget; a `WHERE` clause that isn't there won't
  return rows. Row-level security on Supabase was the first version of
  this app, which is why the project migrated: being able to see all
  SQL for a request in one route file was worth the duplication.
- **Action item → tracker sync is one-way.** When a tracker item's
  status changes, the linked action item is updated to match. The
  reverse is not true. Two-way sync would have needed an "is this a
  loop?" guard on every update, and the human workflow doesn't need it:
  action items are the meeting output; the tracker is where engineering
  work lives after that.
- **`assigned_to_name` is denormalized next to `assigned_to`.** The FK
  can go null when a user is deleted, but the name needs to survive
  for audit purposes. When the user still exists, the join wins; when
  they don't, the stored name is the fallback.
- **Date columns are returned as `YYYY-MM-DD` strings, not JS `Date`
  objects.** `pg` defaults to parsing `DATE` in the server's local
  timezone, which shifted dates back one day on JSON round-trip for
  anyone east of UTC. See `backend/src/db.js`.

## Local setup

Prereqs: Node 20+, a Postgres database (Neon's free tier works), a
Gemini API key for the AI features (optional — the rest of the app
works without it).

```bash
# backend
cd backend
cp .env.example .env
# fill DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN (e.g. "7d"),
# PORT (3001), GEMINI_API_KEY (optional)
# then load the schema once:
psql "$DATABASE_URL" -f schema.sql
npm install
npm run dev

# frontend (new terminal, from repo root)
npm install
npm run dev
# visit http://localhost:5173
```

The Vite dev server proxies `/api/*` to `localhost:3001` — see
`vite.config.js`. First visit, register a workspace at `/register`.

## Project structure

```
backend/
  schema.sql               # one-shot schema
  src/
    index.js               # app bootstrap, route mounting
    db.js                  # pg Pool + date-type override
    middleware/            # auth, audit, notify
    routes/                # one file per resource
src/
  main.jsx, App.jsx        # bootstrap, routes
  api/client.js            # typed-ish API wrappers
  context/AuthContext.jsx  # session, roles
  layouts/AppLayout.jsx    # sidebar, header, global search
  pages/                   # one per route
  components/              # Modal, Spinner, etc.
```

## Status and roadmap

Working today: all core flows above, workspace registration, role-based
dashboards, global search, audit log, in-app notifications, PDF/Excel
export of meetings and tracker lists.

Known gaps I'd close next:
- Mobile navigation (currently desktop-only).
- Bundle size — exports eagerly load `jspdf`, `html2canvas`, `docx`,
  `xlsx`; needs dynamic import.
- Backend tests (none right now).
- Rate limit on `/api/auth/login`, request-shape validation layer.
