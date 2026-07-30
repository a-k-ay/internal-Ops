import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CheckSquare, User, Lock, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', width: 52, height: 52, background: 'var(--primary)', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
            <CheckSquare size={28} color="white" />
          </div>
          <h1 style={{ fontSize: '1.625rem', marginBottom: '0.375rem' }}>Welcome back</h1>
          <p>Sign in to your workspace</p>
        </div>

        <div className="card" style={{ padding: '2rem' }}>
          {error && <div className="alert alert-error mb-4">{error}</div>}
          <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="label">Username</label>
              <div className="input-icon-wrap">
                <User size={15} className="icon" />
                <input className="input" placeholder="your_username" value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required autoFocus />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Password</label>
              <div className="input-icon-wrap" style={{ position: 'relative' }}>
                <Lock size={15} className="icon" />
                <input className="input" type={showPw ? 'text' : 'password'} placeholder="••••••••"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={{ paddingRight: '2.5rem' }} required />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full" style={{ marginTop: '0.5rem', height: '2.625rem' }} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem' }}>
          New to the platform?{' '}
          <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 600 }}>Create a workspace</Link>
        </p>
      </div>
    </div>
  )
}
