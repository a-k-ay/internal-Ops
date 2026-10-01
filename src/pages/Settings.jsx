import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usersAPI, notificationsAPI, auditAPI } from '../api/client'
import { User, Shield, Bell, Plus, Edit2, ToggleLeft, ToggleRight, Trash2, Eye, EyeOff, Clock } from 'lucide-react'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import Badge from '../components/Badge'
import { format, parseISO } from 'date-fns'

const TABS = [
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'users', label: 'User Management', icon: Shield, adminOnly: true },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'audit', label: 'Audit Log', icon: Clock, superAdminOnly: true },
]

export default function Settings() {
  const toast = useToast()
  const { tab: tabParam } = useParams()
  const navigate = useNavigate()
  const { user, isSuperAdmin, isPM } = useAuth()
  const [activeTab, setActiveTab] = useState(tabParam || 'profile')

  useEffect(() => { if (tabParam) setActiveTab(tabParam) }, [tabParam])
  const switchTab = (t) => { setActiveTab(t); navigate(`/settings/${t}`) }

  const visibleTabs = TABS.filter(t => {
    if (t.superAdminOnly) return isSuperAdmin
    if (t.adminOnly) return isPM
    return true
  })

  return (
    <div className="fade-in">
      <h1 style={{ marginBottom: '1.5rem' }}>Settings</h1>
      <div className="flex gap-4" style={{ alignItems: 'flex-start' }}>
        {/* Tab Nav */}
        <div className="card" style={{ width: 200, padding: '0.5rem', flexShrink: 0 }}>
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => switchTab(id)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 0.75rem', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: activeTab === id ? 600 : 400, background: activeTab === id ? 'var(--primary-soft)' : 'transparent', color: activeTab === id ? 'var(--primary)' : 'var(--text-muted)', transition: 'all 0.15s', marginBottom: 2 }}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeTab === 'profile' && <ProfileTab user={user} />}
          {activeTab === 'users' && isPM && <UsersTab isSuperAdmin={isSuperAdmin} />}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'audit' && isSuperAdmin && <AuditTab />}
        </div>
      </div>
    </div>
  )
}

/* ---- PROFILE TAB ---- */
function ProfileTab({ user }) {
  const [form, setForm] = useState({ fullName: user?.fullName || '', currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [showPw, setShowPw] = useState(false)

  const save = async (e) => {
    e.preventDefault(); setMsg(''); setError('')
    if (form.newPassword && form.newPassword !== form.confirmPassword) return setError('Passwords do not match')
    setSaving(true)
    try {
      await usersAPI.updateProfile({ fullName: form.fullName, currentPassword: form.currentPassword || undefined, newPassword: form.newPassword || undefined })
      setMsg('Profile updated successfully'); setForm(f => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }))
    } catch (err) { setError(err.message) }
    setSaving(false)
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 className="mb-4">My Profile</h3>
      {msg && <div className="alert alert-success mb-4">{msg}</div>}
      {error && <div className="alert alert-error mb-4">{error}</div>}
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="form-group"><label className="label">Full Name</label><input className="input" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} required /></div>
        <div className="form-group"><label className="label">Username</label><input className="input" value={user?.username} disabled style={{ background: 'var(--bg-sidebar)', cursor: 'not-allowed' }} /></div>
        <div className="form-group"><label className="label">Role</label><Badge value={user?.role} /></div>
        <div className="form-group"><label className="label">Workspace</label><span style={{ fontSize: '0.9375rem', color: 'var(--text-muted)' }}>{user?.workspaceName}</span></div>
        <div className="divider" />
        <h4 style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.9rem' }}>Change Password (optional)</h4>
        <div className="form-group"><label className="label">Current Password</label>
          <div style={{ position: 'relative' }}>
            <input className="input" type={showPw ? 'text' : 'password'} value={form.currentPassword} onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} style={{ paddingRight: '2.5rem' }} />
            <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label className="label">New Password</label><input className="input" type="password" value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} /></div>
          <div className="form-group"><label className="label">Confirm New</label><input className="input" type="password" value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} /></div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>{saving ? <span className="spinner" /> : 'Save Changes'}</button>
      </form>
    </div>
  )
}

/* ---- USERS TAB ---- */
function UsersTab({ isSuperAdmin }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({ fullName: '', username: '', password: '', role: 'member' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)

  const load = async () => { setLoading(true); try { setUsers(await usersAPI.list()) } catch (err) { console.warn('[Settings.loadUsers]', err) } setLoading(false) }
  useEffect(() => { load() }, [])

  const openAdd = () => { setEditUser(null); setForm({ fullName: '', username: '', password: '', role: 'member' }); setError(''); setShowModal(true) }
  const openEdit = (u) => { setEditUser(u); setForm({ fullName: u.full_name, username: u.username, password: '', role: u.role }); setError(''); setShowModal(true) }

  const save = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      if (editUser) await usersAPI.update(editUser.id, { fullName: form.fullName, username: form.username, role: form.role, password: form.password || undefined })
      else await usersAPI.create(form)
      setShowModal(false); load()
    } catch (err) { setError(err.message) }
    setSaving(false)
  }

  const toggleActive = async (id) => { try { await usersAPI.toggleActive(id); load() } catch (err) { toast.error(err.message) } }
  const deleteUser = async (id) => {
    try { await usersAPI.delete(id); load() } catch (err) { toast.error(err.message) }
    setConfirm(null)
  }

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3>User Management</h3>
        {isSuperAdmin && <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={14} />Add User</button>}
      </div>
      {loading ? <Spinner center /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th>{isSuperAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}</tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>@{u.username}</td>
                  <td><Badge value={u.role} /></td>
                  <td><span style={{ fontSize: '0.8125rem', fontWeight: 600, color: u.is_active ? 'var(--success)' : 'var(--text-muted)' }}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                  {isSuperAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn-ghost" onClick={() => openEdit(u)}><Edit2 size={14} /></button>
                        <button className="btn-ghost" onClick={() => toggleActive(u.id)} title={u.is_active ? 'Deactivate' : 'Activate'}>
                          {u.is_active ? <ToggleRight size={18} style={{ color: 'var(--success)' }} /> : <ToggleLeft size={18} style={{ color: 'var(--text-muted)' }} />}
                        </button>
                        <button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => setConfirm(u)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editUser ? 'Edit User' : 'Add User'} onClose={() => setShowModal(false)} maxWidth="420px"
          footer={<><button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spinner" /> : editUser ? 'Save' : 'Create User'}</button></>}>
          {error && <div className="alert alert-error mb-4">{error}</div>}
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div className="form-group"><label className="label">Full Name *</label><input className="input" value={form.fullName} onChange={setF('fullName')} required autoFocus /></div>
            <div className="form-group"><label className="label">Username *</label><input className="input" value={form.username} onChange={setF('username')} required /></div>
            <div className="form-group"><label className="label">{editUser ? 'New Password (leave blank to keep)' : 'Password *'}</label><input className="input" type="password" value={form.password} onChange={setF('password')} required={!editUser} /></div>
            <div className="form-group">
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={setF('role')}>
                <option value="member">Member</option>
                <option value="pm">Project Manager (PM)</option>
              </select>
            </div>
          </form>
        </Modal>
      )}
      {confirm && <ConfirmDialog title="Delete User" message={`Delete "${confirm.full_name}"? This cannot be undone.`} onConfirm={() => deleteUser(confirm.id)} onCancel={() => setConfirm(null)} />}
    </div>
  )
}

/* ---- NOTIFICATIONS TAB ---- */
function NotificationsTab() {
  const [notifs, setNotifs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => { setLoading(true); try { setNotifs(await notificationsAPI.list()) } catch (err) { console.warn('[Settings.loadNotifications]', err) } setLoading(false) }
  useEffect(() => { load() }, [])

  const markRead = async (id) => { try { await notificationsAPI.markRead(id); setNotifs(n => n.map(x => x.id === id ? { ...x, is_read: true } : x)) } catch (err) { console.warn('[Settings.markRead]', err) } }
  const markAll = async () => { try { await notificationsAPI.markAllRead(); setNotifs(n => n.map(x => ({ ...x, is_read: true }))) } catch (err) { console.warn('[Settings.markAllRead]', err) } }

  const unread = notifs.filter(n => !n.is_read).length

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3>Notifications {unread > 0 && <span style={{ marginLeft: 6, fontSize: '0.8125rem', background: 'var(--primary)', color: '#fff', borderRadius: '9999px', padding: '0.1rem 0.5rem' }}>{unread}</span>}</h3>
        {unread > 0 && <button className="btn btn-outline btn-sm" onClick={markAll}>Mark all read</button>}
      </div>
      {loading ? <Spinner center /> : notifs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No notifications</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {notifs.map(n => (
            <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
              style={{ padding: '0.875rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', cursor: n.is_read ? 'default' : 'pointer', background: n.is_read ? 'transparent' : 'var(--primary-soft)', transition: 'background 0.15s' }}>
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: n.is_read ? 'var(--text-muted)' : 'var(--text-main)' }}>{n.title}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{format(parseISO(n.created_at), 'MMM d, h:mm a')}</span>
              </div>
              <p style={{ fontSize: '0.8125rem', margin: 0, color: 'var(--text-muted)' }}>{n.message}</p>
              {!n.is_read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', float: 'right', marginTop: -12 }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---- AUDIT TAB ---- */
function AuditTab() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { auditAPI.list().then(setLogs).catch(console.error).finally(() => setLoading(false)) }, [])

  const actionColor = { create: 'var(--success)', update: 'var(--warning)', delete: 'var(--error)', archive: 'var(--warning)', restore: 'var(--secondary)', login: 'var(--primary)', logout: 'var(--text-muted)' }

  return (
    <div className="card">
      <h3 className="mb-4">Audit Log</h3>
      {loading ? <Spinner center /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Name</th></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{format(parseISO(l.created_at), 'MMM d, h:mm a')}</td>
                  <td style={{ fontSize: '0.875rem' }}>{l.user_name || '—'}</td>
                  <td><span style={{ fontWeight: 700, fontSize: '0.75rem', color: actionColor[l.action] || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l.action}</span></td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{l.entity_type?.replace('_', ' ')}</td>
                  <td style={{ fontSize: '0.875rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.entity_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
