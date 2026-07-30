import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CheckSquare, Building2, User, Lock } from 'lucide-react'

export default function RegisterWorkspace() {
  const { registerWorkspace } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ workspaceName: '', fullName: '', username: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) return setError('Passwords do not match')
    if (form.password.length < 6) return setError('Password must be at least 6 characters')
    setLoading(true)
    try {
      await registerWorkspace({ workspaceName: form.workspaceName, fullName: form.fullName, username: form.username, password: form.password })
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', width: 52, height: 52, background: 'var(--primary)', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
            <CheckSquare size={28} color="white" />
          </div>
          <h1 style={{ fontSize: '1.625rem', marginBottom: '0.375rem' }}>Create your workspace</h1>
          <p>Set up your team's Action Board</p>
        </div>
        <div className="card" style={{ padding: '2rem' }}>
          {error && <div className="alert alert-error mb-4">{error}</div>}
          <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="label">Workspace / Company Name</label>
              <div className="input-icon-wrap">
                <Building2 size={15} className="icon" />
                <input className="input" placeholder="Acme Technologies" value={form.workspaceName} onChange={set('workspaceName')} required autoFocus />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Your Full Name</label>
              <div className="input-icon-wrap">
                <User size={15} className="icon" />
                <input className="input" placeholder="Jane Smith" value={form.fullName} onChange={set('fullName')} required />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Username <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(used to login)</span></label>
              <div className="input-icon-wrap">
                <User size={15} className="icon" />
                <input className="input" placeholder="jane_smith" value={form.username} onChange={set('username')} required />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="label">Password</label>
                <div className="input-icon-wrap">
                  <Lock size={15} className="icon" />
                  <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Confirm Password</label>
                <div className="input-icon-wrap">
                  <Lock size={15} className="icon" />
                  <input className="input" type="password" placeholder="••••••••" value={form.confirmPassword} onChange={set('confirmPassword')} required />
                </div>
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full" style={{ marginTop: '0.5rem', height: '2.625rem' }} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create Workspace'}
            </button>
          </form>
        </div>
        <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem' }}>
          Already have a workspace? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign In</Link>
        </p>
      </div>
    </div>
  )
}
