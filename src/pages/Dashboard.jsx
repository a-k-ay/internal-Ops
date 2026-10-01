import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardAPI } from '../api/client'
import { Building2, CheckSquare, AlertTriangle, TrendingUp, Clock, ChevronDown, Calendar, Target, PieChart, Layers, FolderOpen, Users, Search } from 'lucide-react'
import Spinner from '../components/Spinner'
import { format, parseISO, isToday, isPast, differenceInCalendarDays } from 'date-fns'
import Badge from '../components/Badge'

/* ---------------- Reusable UI bits ---------------- */

function CollapsibleSection({ title, icon: Icon, headerRight, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`dash-section${open ? ' is-open' : ''}`}>
      <button type="button" className="dash-ribbon" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="dash-ribbon-title">
          {Icon && <span className="dash-ribbon-icon"><Icon size={16} /></span>}
          {title}
        </span>
        <span className="flex items-center gap-3">
          {open && headerRight && <span onClick={e => e.stopPropagation()}>{headerRight}</span>}
          <ChevronDown size={16} className="dash-ribbon-chevron" />
        </span>
      </button>
      {open && <div className="dash-section-body">{children}</div>}
    </div>
  )
}

function KpiTile({ label, value, icon: Icon, color, bg, to, extra, valueColor }) {
  const navigate = useNavigate()
  return (
    <div
      className={`kpi-card flex items-center gap-3${to ? ' kpi-clickable' : ''}`}
      onClick={() => to && navigate(to)}
      role={to ? 'button' : undefined}
      tabIndex={to ? 0 : undefined}
      onKeyDown={to ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(to) } } : undefined}
    >
      <div className="kpi-icon" style={{ background: bg, color }}>
        <Icon size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="kpi-value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
        <div className="kpi-label">{label}</div>
        {extra}
      </div>
    </div>
  )
}

function ProgressBar({ done, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <>
      <div className="dash-progress" aria-label={`${done} of ${total}`}><span style={{ width: `${pct}%` }} /></div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>{done} of {total} closed</div>
    </>
  )
}

function WeekDots({ counts }) {
  // counts: array of 7 numbers Mon..Sun
  const todayIdx = (new Date().getDay() + 6) % 7 // Mon=0..Sun=6
  return (
    <div className="dash-weekdots" aria-label="Due this week">
      {counts.map((n, i) => (
        <span key={i} className={`d${n > 0 ? ' has' : ''}${i === todayIdx ? ' today' : ''}`} title={`${n} due`} />
      ))}
    </div>
  )
}

/* SVG donut — simple 2-slice donut used by tracker insights */
function Donut({ segments, size = 140 }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  const stroke = 18
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sidebar)" strokeWidth={stroke} />
      {segments.map((seg, i) => {
        const len = (seg.value / total) * c
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={seg.color} strokeWidth={stroke}
            strokeDasharray={`${len} ${c}`} strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray 0.35s ease' }}
          />
        )
        offset += len
        return el
      })}
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        style={{ fontSize: 24, fontWeight: 700, fill: 'var(--text-main)' }}>{total}</text>
      <text x="50%" y="66%" dominantBaseline="central" textAnchor="middle"
        style={{ fontSize: 11, fill: 'var(--text-muted)' }}>total</text>
    </svg>
  )
}

function HBarList({ rows, colorFor }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} className="dash-hbar-row" title={`${r.label}: ${r.value}`}>
          <div>
            <div className="dash-hbar-label"><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span></div>
            <div className="dash-hbar-track"><span style={{ width: `${(r.value / max) * 100}%`, background: colorFor ? colorFor(r) : 'var(--primary)' }} /></div>
          </div>
          <div className="dash-hbar-count">{r.value}</div>
        </div>
      ))}
    </div>
  )
}

/* ---------------- Dashboard ---------------- */

export default function Dashboard() {
  const { user, isMember } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboardAPI.global().then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner large center />

  if (data?.isMemberDashboard || isMember) return <MemberDashboard data={data} user={user} navigate={navigate} />
  return <AdminDashboard data={data} user={user} navigate={navigate} />
}

/* ---------------- Admin / PM ---------------- */

function AdminDashboard({ data, user, navigate }) {
  const openCount = data?.openActionItems ?? 0
  const totalCount = data?.totalActionItems ?? 0
  const overdue = data?.overdueActionItems ?? 0
  const closedCount = Math.max(0, totalCount - openCount)

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Good {getGreeting()}, {user?.fullName?.split(' ')[0]}</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>How projects and the team are progressing right now.</p>
      </div>

      {/* KPI Row */}
      <div className="dash-grid-4" style={{ marginBottom: '0.6rem' }}>
        <KpiTile label="Active Clients" value={data?.totalActiveClients ?? 0} icon={Building2}
          color="var(--primary)" bg="var(--primary-soft)" to="/clients" />
        <KpiTile label="Active Projects" value={data?.activeProjects ?? 0} icon={FolderOpen}
          color="var(--secondary)" bg="var(--secondary-soft)" to="/meetings?view=all" />
        <KpiTile label="Open Action Items" value={openCount} icon={CheckSquare}
          color="var(--primary)" bg="var(--primary-soft)" to="/tracker?view=all"
          extra={totalCount > 0 && <ProgressBar done={closedCount} total={totalCount} />} />
        <KpiTile label="Overdue Items" value={overdue} icon={AlertTriangle}
          color="var(--error)" bg="var(--error-soft)" to="/tracker?view=all"
          valueColor={overdue > 0 ? 'var(--error)' : undefined}
          extra={overdue > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', marginTop: 3 }}>needs attention<span className="dash-pulse" /></span>} />
      </div>

      {/* Team Workload */}
      <TeamWorkloadSection data={data} navigate={navigate} />

      {/* Recent Meetings + Due in 7 Days */}
      <div className="dash-grid-2">
        <CollapsibleSection title="Recent Meetings" icon={Calendar}
          headerRight={<button className="btn btn-outline btn-sm" onClick={() => navigate('/meetings')}>View all</button>}>
          {data?.recentMeetings?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {data.recentMeetings.map(m => (
                <div key={m.id} onClick={() => navigate(`/meetings/${m.id}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.7rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-soft)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{m.client_name} · {m.project_name}</div>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '0.75rem' }}>{format(parseISO(m.date), 'MMM d')}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.85rem', margin: 0 }}>No meetings yet</p>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Due in Next 7 Days" icon={Clock}>
          {data?.upcomingDueDates?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {data.upcomingDueDates.map(a => {
                const days = differenceInCalendarDays(parseISO(a.due_date), new Date())
                const accent = days < 0 ? 'var(--error)' : days === 0 ? 'var(--warning)' : 'var(--text-muted)'
                return (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.7rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', borderLeft: `3px solid ${accent}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{a.assigned_to_name || 'Unassigned'} · {a.client_name}</div>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: accent, fontWeight: 600, flexShrink: 0, marginLeft: '0.75rem' }}>{format(parseISO(a.due_date), 'MMM d')}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.85rem', margin: 0 }}>No upcoming due dates</p>
          )}
        </CollapsibleSection>
      </div>

      {/* Combined Tracker Insights */}
      <TrackerInsights data={data} />
    </div>
  )
}

/* Team Workload — stacked bar per member, with client/project/search filters */
function TeamWorkloadSection({ data, navigate }) {
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [search, setSearch] = useState('')

  const clientOptions = data?.clientOptions || []
  const projectOptions = useMemo(() => {
    if (!clientId) return data?.projectOptions || []
    return (data?.projectOptions || []).filter(p => p.client_id === clientId)
  }, [clientId, data])
  useEffect(() => { setProjectId('') }, [clientId])

  // If filters active, aggregate from teamAssignments; else use precomputed teamWorkload
  const rows = useMemo(() => {
    const filterActive = clientId || projectId
    const users = new Map()
    for (const w of (data?.teamWorkload || [])) {
      users.set(w.user_id, { user_id: w.user_id, full_name: w.full_name, open: 0, in_progress: 0, closed: 0, overdue: 0, total: 0 })
    }
    if (!filterActive) {
      for (const w of (data?.teamWorkload || [])) {
        const u = users.get(w.user_id)
        u.open = w.open_count
        u.in_progress = w.in_progress_count
        u.closed = w.closed_count
        u.overdue = w.overdue_count
        u.total = w.total
      }
    } else {
      for (const a of (data?.teamAssignments || [])) {
        if (clientId && a.client_id !== clientId) continue
        if (projectId && a.project_id !== projectId) continue
        const u = users.get(a.user_id)
        if (!u) continue
        u.total += 1
        if (a.status === 'open') u.open += 1
        else if (a.status === 'in_progress') u.in_progress += 1
        else if (a.status === 'closed') u.closed += 1
        if (a.is_overdue) u.overdue += 1
      }
    }
    let out = Array.from(users.values()).filter(u => u.total > 0)
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      out = out.filter(u => (u.full_name || '').toLowerCase().includes(s))
    }
    out.sort((a, b) => b.total - a.total)
    return out
  }, [data, clientId, projectId, search])

  const clear = () => { setClientId(''); setProjectId(''); setSearch('') }

  return (
    <CollapsibleSection title="Team Workload" icon={Users}>
      {/* Filters */}
      <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <div className="input-icon-wrap" style={{ flex: '1 1 180px', maxWidth: 220 }}>
          <Search size={13} className="icon" />
          <input className="input" style={{ height: 32 }} placeholder="Search member..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input dash-filter-select" value={clientId} onChange={e => setClientId(e.target.value)}>
          <option value="">All Clients</option>
          {clientOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input dash-filter-select wide" value={projectId} onChange={e => setProjectId(e.target.value)} disabled={!clientId && projectOptions.length > 20}>
          <option value="">All Projects</option>
          {projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {(search || clientId || projectId) && <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>}
      </div>

      {/* Legend */}
      <div className="dash-workload-legend">
        <span><span className="dot" style={{ background: '#ef4444' }} />Open</span>
        <span><span className="dot" style={{ background: '#3b82f6' }} />In Progress</span>
        <span><span className="dot" style={{ background: '#b91c1c' }} />Overdue</span>
        <span><span className="dot" style={{ background: '#16a34a' }} />Closed</span>
      </div>

      {rows.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>No team members match these filters</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: '0.5rem' }}>
          {rows.map(r => {
            const total = Math.max(1, r.total)
            const openW = (r.open / total) * 100
            const progW = (r.in_progress / total) * 100
            const overW = (r.overdue / total) * 100
            const closedW = (r.closed / total) * 100
            return (
              <div key={r.user_id} className="dash-workload-row" onClick={() => navigate('/tracker?view=all')}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.full_name}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.72rem' }}>({r.total})</span>
                </div>
                <div className="dash-stacked">
                  <span className="seg-open" style={{ width: `${openW}%` }} title={`Open: ${r.open}`} />
                  <span className="seg-progress" style={{ width: `${progW}%` }} title={`In Progress: ${r.in_progress}`} />
                  <span className="seg-overdue" style={{ width: `${overW}%` }} title={`Overdue: ${r.overdue}`} />
                  <span className="seg-closed" style={{ width: `${closedW}%` }} title={`Closed: ${r.closed}`} />
                </div>
                <div style={{ fontSize: '0.72rem', color: r.overdue > 0 ? 'var(--error)' : 'var(--text-muted)', fontWeight: r.overdue > 0 ? 700 : 500, minWidth: 60, textAlign: 'right' }}>
                  {r.overdue > 0 ? `${r.overdue} overdue` : `${r.open + r.in_progress} active`}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </CollapsibleSection>
  )
}

/* Combined Tracker Insights — one section, toggle Status | Classification */
function TrackerInsights({ data }) {
  const [dim, setDim] = useState('status')
  const statusColors = { pending: '#f59e0b', in_progress: '#3b82f6', closed: '#16a34a' }
  const classColors = { issue: '#ef4444', new_requirement: '#3b82f6', change_request: '#f59e0b', tbd: '#64748b' }

  const statusRows = (data?.trackerByStatus || []).map(r => ({
    key: r.status, label: prettyLabel(r.status), value: Number(r.count), color: statusColors[r.status] || 'var(--primary)'
  }))
  const classRows = (data?.trackerByClassification || []).map(r => ({
    key: r.classification, label: prettyLabel(r.classification), value: Number(r.count), color: classColors[r.classification] || 'var(--primary)'
  }))

  const active = dim === 'status' ? statusRows : classRows
  const total = active.reduce((s, r) => s + r.value, 0)

  if (statusRows.length === 0 && classRows.length === 0) return null

  return (
    <CollapsibleSection title="Tracker Insights" icon={PieChart}
      headerRight={
        <div className="dash-seg">
          <button className={dim === 'status' ? 'active' : ''} onClick={() => setDim('status')}>By Status</button>
          <button className={dim === 'classification' ? 'active' : ''} onClick={() => setDim('classification')}>By Classification</button>
        </div>
      }>
      {active.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>No tracker items yet</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '1.25rem', alignItems: 'center' }}>
          <Donut segments={active.map(r => ({ value: r.value, color: r.color }))} />
          <div>
            <HBarList rows={active} colorFor={r => r.color} />
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.35rem', fontSize: '0.8rem', fontWeight: 700 }}>
              <span>Total</span><span>{total}</span>
            </div>
          </div>
        </div>
      )}
    </CollapsibleSection>
  )
}

/* ---------------- Member ---------------- */

function MemberDashboard({ data, user, navigate }) {
  const open = data?.myOpenTasks ?? 0
  const dueWk = data?.myDueThisWeek ?? 0
  const overdue = data?.myOverdueTasks ?? 0
  const closedMonth = data?.myCompletedThisMonth ?? 0
  const monthTotal = open + closedMonth // approximation for progress ratio

  // 7-day dot counts (Mon..Sun) from upcomingTasks
  const weekCounts = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0]
    const now = new Date()
    ;(data?.upcomingTasks || []).forEach(t => {
      const d = parseISO(t.due_date)
      const diff = differenceInCalendarDays(d, now)
      if (diff >= 0 && diff < 7) {
        const idx = (d.getDay() + 6) % 7
        counts[idx] += 1
      }
    })
    return counts
  }, [data])

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Good {getGreeting()}, {user?.fullName?.split(' ')[0]}</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>What you need to complete today and this week.</p>
      </div>

      {/* KPI Row */}
      <div className="dash-grid-4" style={{ marginBottom: '0.6rem' }}>
        <KpiTile label="My Open Tasks" value={open} icon={CheckSquare} color="var(--primary)" bg="var(--primary-soft)" to="/tracker?view=all"
          extra={monthTotal > 0 && <ProgressBar done={closedMonth} total={monthTotal} />} />
        <KpiTile label="Due This Week" value={dueWk} icon={Clock} color="var(--warning)" bg="var(--warning-soft)" to="/tracker?view=all"
          extra={<WeekDots counts={weekCounts} />} />
        <KpiTile label="Overdue Tasks" value={overdue} icon={AlertTriangle} color="var(--error)" bg="var(--error-soft)" to="/tracker?view=all"
          valueColor={overdue > 0 ? 'var(--error)' : undefined}
          extra={overdue > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', marginTop: 3 }}>needs attention<span className="dash-pulse" /></span>} />
        <KpiTile label="Completed This Month" value={closedMonth} icon={TrendingUp} color="var(--success)" bg="var(--success-soft)" to="/tracker?view=all" />
      </div>

      {/* Priority Queue */}
      <MemberPriorityQueue tasks={data?.tasksDueSoon || []} navigate={navigate} />

      {/* Tasks by Project (bar) + Task Status Mix (donut) */}
      <div className="dash-grid-2">
        <CollapsibleSection title="My Tasks by Project" icon={Target}>
          {(data?.tasksByClassification || []).length === 0 ? (
            <p style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>No tasks yet</p>
          ) : (
            <HBarList
              rows={(data?.tasksByClassification || []).slice(0, 5).map(p => ({ label: p.project, value: Number(p.count), color: 'var(--primary)' }))}
              colorFor={() => 'var(--primary)'}
            />
          )}
        </CollapsibleSection>

        <CollapsibleSection title="My Task Status Mix" icon={PieChart}>
          {(data?.tasksByStatus || []).length === 0 ? (
            <p style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>No tasks yet</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '1rem', alignItems: 'center' }}>
              <Donut size={120} segments={(data?.tasksByStatus || []).map(s => ({
                value: Number(s.count),
                color: s.status === 'open' ? '#ef4444' : s.status === 'in_progress' ? '#3b82f6' : s.status === 'closed' ? '#16a34a' : '#94a3b8'
              }))} />
              <div>
                {(data?.tasksByStatus || []).map(s => (
                  <div key={s.status} className="flex items-center justify-between" style={{ padding: '0.25rem 0' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                        background: s.status === 'open' ? '#ef4444' : s.status === 'in_progress' ? '#3b82f6' : s.status === 'closed' ? '#16a34a' : '#94a3b8' }} />
                      {prettyLabel(s.status)}
                    </span>
                    <span style={{ fontWeight: 700 }}>{Number(s.count)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  )
}

/* Member — priority queue: overdue → today → this week → later */
function MemberPriorityQueue({ tasks, navigate }) {
  const now = new Date()
  const groups = { overdue: [], today: [], week: [], later: [] }
  tasks.forEach(t => {
    const d = parseISO(t.due_date)
    if (isPast(d) && !isToday(d)) groups.overdue.push(t)
    else if (isToday(d)) groups.today.push(t)
    else if (differenceInCalendarDays(d, now) <= 7) groups.week.push(t)
    else groups.later.push(t)
  })
  const total = tasks.length

  return (
    <CollapsibleSection title="My Priority Queue" icon={AlertTriangle}
      headerRight={<button className="btn btn-outline btn-sm" onClick={() => navigate('/tracker?view=all')}>View all</button>}>
      {total === 0 ? (
        <p style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>You're all caught up. 🎉</p>
      ) : (
        <>
          <QueueGroup title="Overdue" color="#ef4444" tasks={groups.overdue} navigate={navigate} />
          <QueueGroup title="Due Today" color="#f59e0b" tasks={groups.today} navigate={navigate} />
          <QueueGroup title="Due This Week" color="#3b82f6" tasks={groups.week} navigate={navigate} />
          <QueueGroup title="Coming Up" color="#94a3b8" tasks={groups.later} navigate={navigate} />
        </>
      )}
    </CollapsibleSection>
  )
}

function QueueGroup({ title, color, tasks, navigate }) {
  if (!tasks.length) return null
  return (
    <div className="dash-queue-group">
      <div className="dash-queue-heading"><span className="swatch" style={{ background: color }} />{title}<span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>({tasks.length})</span></div>
      {tasks.map(t => (
        <div key={t.id} className="dash-queue-row" onClick={() => navigate('/tracker?view=all')}>
          <div style={{ minWidth: 0 }}>
            <div className="dash-queue-title">{t.title}</div>
            <div className="dash-queue-meta">{t.client_name || '—'}</div>
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{format(parseISO(t.due_date), 'MMM d')}</span>
          <Badge value={t.status} />
        </div>
      ))}
    </div>
  )
}

/* ---------------- helpers ---------------- */

function prettyLabel(s) {
  if (!s) return ''
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
