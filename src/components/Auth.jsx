import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Mail, Lock, User, Loader2, CheckSquare } from 'lucide-react'

export default function Auth() {
    const [loading, setLoading] = useState(false)
    const [isSignUp, setIsSignUp] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [error, setError] = useState(null)
    const [message, setMessage] = useState('')

    const handleAuth = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setMessage('')

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: fullName,
                        },
                    },
                })
                if (error) throw error
                setMessage('Registration successful! Please sign in.')
                setIsSignUp(false)
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error
                localStorage.setItem('lastEmail', email)
                localStorage.setItem('lastPassword', password)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main)', padding: '1rem' }}>
            <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{
                        display: 'inline-flex',
                        padding: '1rem',
                        borderRadius: '1rem',
                        backgroundColor: 'var(--accent-soft)',
                        marginBottom: '1.5rem'
                    }}>
                        <CheckSquare size={40} color="var(--primary)" />
                    </div>
                    <h1>C² Action Board</h1>
                    <p>{isSignUp ? 'Create your professional account' : 'Welcome back! Sign in to continue'}</p>
                </div>

                {error && (
                    <div style={{ backgroundColor: '#fef2f2', color: 'var(--error)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', fontSize: '0.875rem', fontWeight: 500, border: '1px solid #fee2e2' }}>
                        {error}
                    </div>
                )}

                {message && (
                    <div style={{ backgroundColor: 'var(--details-bg)', color: 'var(--success)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', fontSize: '0.875rem', fontWeight: 500, border: '1px solid var(--border)' }}>
                        {message}
                    </div>
                )}

                <form onSubmit={handleAuth}>
                    {isSignUp && (
                        <div className="form-group">
                            <label className="label">Full Name</label>
                            <div style={{ position: 'relative' }}>
                                <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    className="input"
                                    style={{ paddingLeft: '3rem' }}
                                    placeholder="John Doe"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <div className="form-group">
                        <label className="label">Email Address</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="email"
                                className="input"
                                style={{ paddingLeft: '3rem' }}
                                placeholder="name@company.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                list="email-suggestions"
                                required
                            />
                            <datalist id="email-suggestions">
                                {localStorage.getItem('lastEmail') && <option value={localStorage.getItem('lastEmail')} />}
                            </datalist>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="label">Password</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="password"
                                className="input"
                                style={{ paddingLeft: '3rem' }}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                list="password-suggestions"
                                required
                            />
                            <datalist id="password-suggestions">
                                {localStorage.getItem('lastPassword') && <option value={localStorage.getItem('lastPassword')} />}
                            </datalist>
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem', height: '3rem' }} disabled={loading}>
                        {loading ? <Loader2 className="loading-spinner" /> : (isSignUp ? 'Get Started' : 'Sign In')}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.875rem' }}>
                    <button
                        className="btn-ghost"
                        style={{ fontWeight: 600 }}
                        onClick={() => setIsSignUp(!isSignUp)}
                    >
                        {isSignUp ? 'Already have an account? Sign In' : "New here? Create an account"}
                    </button>
                </div>
            </div>
        </div>
    )
}
