import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardAPI } from '../api/client'
import { Building2, Calendar, CheckSquare, AlertTriangle, Target, TrendingUp, Clock } from 'lucide-react'
import Spinner from '../components/Spinner'
import { format, parseISO } from 'date-fns'
import Badge from '../components/Badge'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboardAPI.global().then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner large center />

  const kpis = [
    { label: 'Active Clients', value: data?.totalActiveClients ?? 0, icon: Building2, color: 'var(--primary)', bg: 'var(--primary-soft)' },
    { label: 'Open Action Items', value: data?.openActionItems ?? 0, icon: CheckSquare, color: 'var(--secondary)', bg: 'var(--secondary-soft)' },
    { label: 'Overdue Items', value: data?.overdueActionItems ?? 0, icon: AlertTriangle, color: 'var(--error)', bg: 'var(--error-soft)' },
    { label: 'Meetings This Month', value: data?.meetingsThisMonth ?? 0, icon: Calendar, color: 'var(--warning)', bg: 'var(--warning-soft)' },
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
