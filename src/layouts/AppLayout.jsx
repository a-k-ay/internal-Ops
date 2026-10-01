import { useState, useEffect, useRef } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { notificationsAPI, searchAPI } from '../api/client'
import {
  LayoutDashboard, Users2, Calendar, Target, Settings,
  LogOut, Bell, Search, Sun, Moon, ChevronDown,
  Building2, X, FileText, CheckSquare
} from 'lucide-react'
import { format } from 'date-fns'

export default function AppLayout() {
  const { user, logout, isMember } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => localStorage.getItem('mab_theme') || 'light')
  const [unreadCount, setUnreadCount] = useState(0)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const searchRef = useRef(null)
  const searchTimer = useRef(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mab_theme', theme)
  }, [theme])

  useEffect(() => {
    fetchUnread()
    const t = setInterval(fetchUnread, 30000)
    return () => clearInterval(t)
  }, [])

  const fetchUnread = async () => {
    try { const d = await notificationsAPI.unreadCount(); setUnreadCount(d.count) } catch { /* ignore: polling unread count (every 30s) — don't let a network hiccup break the shell */ }
  }

  const handleLogout = async () => { await logout(); navigate('/login') }

  const handleSearch = (val) => {
    setSearchQ(val)
    clearTimeout(searchTimer.current)
    if (!val.trim() || val.length < 2) { setSearchResults(null); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try { const r = await searchAPI.global(val); setSearchResults(r) } catch { /* ignore: global search debounce — on failure show no results silently */ }
      setSearching(false)
    }, 350)
  }

  useEffect(() => {
    if (showSearch && searchRef.current) searchRef.current.focus()
  }, [showSearch])

  const navItems = isMember
    ? [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/tracker', icon: Target, label: 'Task Tracker' },
      ]
    : [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/clients', icon: Building2, label: 'Clients' },
        { to: '/meetings', icon: Calendar, label: 'Meetings' },
        { to: '/tracker', icon: Target, label: 'Task Tracker' },
      ]

  const totalResults = searchResults ? Object.values(searchResults).reduce((a, b) => a + b.length, 0) : 0

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <div style={{ width: 32, height: 32, background: 'var(--primary)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckSquare size={18} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-main)' }}>Action Board</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 1 }}>{user?.workspaceName}</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '0.75rem 0.5rem', overflowY: 'auto' }}>
          <div className="nav-section">Main</div>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Icon size={18} className="nav-icon" />
              <span>{label}</span>
            </NavLink>
          ))}
          <div className="nav-section" style={{ marginTop: '1rem' }}>Account</div>
          <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <Settings size={18} className="nav-icon" />
            <span>Settings</span>
          </NavLink>
        </nav>

        <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: 'var(--radius)', background: 'var(--bg-sidebar)', marginBottom: '0.5rem' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', color: 'var(--primary)', flexShrink: 0 }}>
              {user?.fullName?.substring(0, 2).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.fullName}</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{user?.role?.replace('_', ' ')}</div>
            </div>
          </div>
          <button className="nav-item w-full" onClick={handleLogout} style={{ color: 'var(--error)' }}>
            <LogOut size={16} /><span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content">
        <header className="page-header">
          <div className="flex items-center gap-3">
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{format(new Date(), 'EEE, MMM d')}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            {showSearch ? (
              <div style={{ position: 'relative' }}>
                <div className="input-icon-wrap">
                  <Search size={15} className="icon" />
                  <input
                    ref={searchRef}
                    className="input"
                    style={{ width: 280, paddingRight: '2rem' }}
                    placeholder="Search anything..."
                    value={searchQ}
                    onChange={e => handleSearch(e.target.value)}
                  />
                </div>
                <button className="btn-ghost" style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }} onClick={() => { setShowSearch(false); setSearchQ(''); setSearchResults(null) }}><X size={14} /></button>
                {(searchResults || searching) && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', zIndex: 200, marginTop: 4, maxHeight: 360, overflowY: 'auto', padding: '0.5rem' }}>
                    {searching && <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Searching...</div>}
                    {!searching && searchResults && totalResults === 0 && <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No results found</div>}
                    {!searching && searchResults && (
                      <>
                        {searchResults.clients?.length > 0 && <SearchGroup label="Clients" items={searchResults.clients} renderItem={i => i.name} onClick={() => { navigate(`/clients`); setShowSearch(false); setSearchQ(''); setSearchResults(null) }} />}
                        {searchResults.meetings?.length > 0 && <SearchGroup label="Meetings" items={searchResults.meetings} renderItem={i => `${i.title} — ${i.client_name}`} onClick={i => { navigate(`/meetings/${i.id}`); setShowSearch(false); setSearchQ(''); setSearchResults(null) }} />}
                        {searchResults.actionItems?.length > 0 && <SearchGroup label="Action Items" items={searchResults.actionItems} renderItem={i => i.title} onClick={() => { setShowSearch(false); setSearchQ(''); setSearchResults(null) }} />}
                        {searchResults.trackerItems?.length > 0 && <SearchGroup label="Tracker" items={searchResults.trackerItems} renderItem={i => i.description} onClick={() => { navigate(`/tracker`); setShowSearch(false); setSearchQ(''); setSearchResults(null) }} />}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button className="btn-ghost" onClick={() => setShowSearch(true)}><Search size={18} /></button>
            )}
            <button className="btn-ghost" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button className="btn-ghost" style={{ position: 'relative' }} onClick={() => navigate('/settings/notifications')}>
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, background: 'var(--error)', color: '#fff', borderRadius: '50%', fontSize: '0.625rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>
        <div className="page-content fade-in">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

function SearchGroup({ label, items, renderItem, onClick }) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-light)', padding: '0.375rem 0.5rem' }}>{label}</div>
      {items.map(item => (
        <button key={item.id} onClick={() => onClick(item)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', color: 'var(--text-main)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-sidebar)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          <span className="truncate">{renderItem(item)}</span>
        </button>
      ))}
    </div>
  )
}
