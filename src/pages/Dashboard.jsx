import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardAPI } from '../api/client'
import { Building2, CheckSquare, AlertTriangle, TrendingUp, Clock } from 'lucide-react'
import Spinner from '../components/Spinner'
import { format, parseISO } from 'date-fns'
import Badge from '../components/Badge'

export default function Dashboard() {
  const { user, isMember } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboardAPI.global().then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner large center />

  // Member Dashboard (detected from backend response or isMember flag)
  if (data?.isMemberDashboard || isMember) {
    const kpis = [
      { label: 'My Open Tasks', value: data?.myOpenTasks ?? 0, icon: CheckSquare, color: '#2563eb', bg: 'rgba(37, 99, 235, 0.1)' },
      { label: 'Due This Week', value: data?.myDueThisWeek ?? 0, icon: Clock, color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)' },
      { label: 'Overdue Tasks', value: data?.myOverdueTasks ?? 0, icon: AlertTriangle, color: '#dc2626', bg: 'rgba(220, 38, 38, 0.1)' },
      { label: 'Completed This Month', value: data?.myCompletedThisMonth ?? 0, icon: TrendingUp, color: '#16a34a', bg: 'rgba(22, 163, 74, 0.1)' },
    ]

    const tasksByStatus = data?.tasksByStatus || []
    const tasksByProject = data?.tasksByClassification || []
    const total = tasksByStatus.reduce((sum, s) => sum + Number(s.count), 0)

    return (
      <div className="fade-in">
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ marginBottom: '0.25rem' }}>Good {getGreeting()}, {user?.fullName?.split(' ')[0]}</h1>
          <p>Here's your work summary for today.</p>
        </div>

        {/* KPI Row */}
        <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
          {kpis.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="kpi-card flex items-center gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--radius)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={24} color={color} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.5rem', color: 'var(--text-main)' }}>{value}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
          {/* My Tasks by Status */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>My Tasks by Status</h3>
            {tasksByStatus.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {tasksByStatus.map(s => {
                  const pct = total > 0 ? Math.round((Number(s.count) / total) * 100) : 0
                  const statusColor = s.status === 'open' ? '#ef4444' : s.status === 'in_progress' ? '#3b82f6' : s.status === 'closed' ? '#16a34a' : '#6b7280'
                  return (
                    <div key={s.status}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <Badge value={s.status} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)' }}>{Number(s.count)}</span>
                      </div>
                      <div style={{ height: 8, background: 'var(--bg-sidebar)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: statusColor, transition: 'width 0.3s ease' }} />
                      </div>
                    </div>
                  )
                })}
                <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 600 }}>
                  <span>Total Tasks</span>
                  <span>{total}</span>
                </div>
              </div>
            ) : (
              <p style={{ textAlign: 'center', padding: '2rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>No tasks yet</p>
            )}
          </div>

          {/* My Upcoming Tasks */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>My Upcoming Tasks</h3>
              {data?.upcomingTasks?.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => navigate('/tracker')}>View all</button>}
            </div>
            {data?.upcomingTasks?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {data.upcomingTasks.map(t => (
                  <div key={t.id} style={{ padding: '0.625rem 0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>{t.client_name || '—'}</span>
                      <span>{format(parseISO(t.due_date), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', padding: '1.5rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>No upcoming tasks</p>
            )}
          </div>
        </div>

        <div className="grid-2">
          {/* Tasks by Project */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Tasks by Project</h3>
            {tasksByProject.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {tasksByProject.map(p => (
                  <div key={p.project} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.375rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{p.project}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-main)', flexShrink: 0 }}>{Number(p.count)}</span>
                  </div>
                ))}
                <div style={{ marginTop: '0.25rem', paddingTop: '0.625rem', display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.875rem' }}>
                  <span>Total</span>
                  <span>{tasksByProject.reduce((sum, p) => sum + Number(p.count), 0)}</span>
                </div>
              </div>
            ) : (
              <p style={{ textAlign: 'center', padding: '1.5rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>No tasks yet</p>
            )}
          </div>

          {/* Tasks Due Soon */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Tasks Due Soon</h3>
            {data?.tasksDueSoon?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {data.tasksDueSoon.map(t => (
                  <div key={t.id} style={{ padding: '0.625rem 0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{t.client_name || '—'}</div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--warning)', flexShrink: 0, marginLeft: '0.5rem' }}>{format(parseISO(t.due_date), 'MMM d')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', padding: '1.5rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>No tasks due soon</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // PM/Admin Dashboard (existing)
  const kpis = [
    { label: 'Active Clients', value: data?.totalActiveClients ?? 0, icon: Building2, color: 'var(--primary)', bg: 'var(--primary-soft)' },
    { label: 'Open Action Items', value: data?.openActionItems ?? 0, icon: CheckSquare, color: 'var(--secondary)', bg: 'var(--secondary-soft)' },
    { label: 'Overdue Items', value: data?.overdueActionItems ?? 0, icon: AlertTriangle, color: 'var(--error)', bg: 'var(--error-soft)' },
    { label: 'Meetings This Month', value: data?.meetingsThisMonth ?? 0, icon: Clock, color: 'var(--warning)', bg: 'var(--warning-soft)' },
  ]

  const trackerStatus = data?.trackerByStatus || []
  const trackerClass = data?.trackerByClassification || []

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Good {getGreeting()}, {user?.fullName?.split(' ')[0]}</h1>
        <p>Here's what's happening across your workspace today.</p>
      </div>

      {/* KPI Row */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        {kpis.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="kpi-card flex items-center gap-3">
            <div className="kpi-icon" style={{ background: bg, color }}>
              <Icon size={20} />
            </div>
            <div>
              <div className="kpi-value">{value}</div>
              <div className="kpi-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        {/* Recent Meetings */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3>Recent Meetings</h3>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/meetings')}>View all</button>
          </div>
          {data?.recentMeetings?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {data.recentMeetings.map(m => (
                <div key={m.id} onClick={() => navigate(`/meetings/${m.id}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-sidebar)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{m.client_name} · {m.project_name}</div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '0.75rem' }}>{format(parseISO(m.date), 'MMM d')}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ textAlign: 'center', padding: '1.5rem 0', fontSize: '0.875rem' }}>No meetings yet</p>
          )}
        </div>

        {/* Upcoming Due Dates */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3>Due in Next 7 Days</h3>
            <Clock size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          {data?.upcomingDueDates?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {data.upcomingDueDates.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{a.assigned_to_name || 'Unassigned'} · {a.client_name}</div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600, flexShrink: 0, marginLeft: '0.75rem' }}>{format(parseISO(a.due_date), 'MMM d')}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ textAlign: 'center', padding: '1.5rem 0', fontSize: '0.875rem' }}>No upcoming due dates</p>
          )}
        </div>
      </div>

      {/* Tracker Stats */}
      {(trackerStatus.length > 0 || trackerClass.length > 0) && (
        <div className="grid-2">
          <div className="card">
            <h3 className="mb-4">Tracker by Status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {trackerStatus.map(s => (
                <div key={s.status} className="flex items-center justify-between">
                  <Badge value={s.status} />
                  <span style={{ fontWeight: 700 }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3 className="mb-4">Tracker by Classification</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {trackerClass.map(c => (
                <div key={c.classification} className="flex items-center justify-between">
                  <Badge value={c.classification} />
                  <span style={{ fontWeight: 700 }}>{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
