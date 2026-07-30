import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { User, Mail, Shield, ArrowLeft, Loader2, Save } from 'lucide-react'

export default function Settings({ session, onBack }) {
    const [loading, setLoading] = useState(false)
    const [profile, setProfile] = useState({
        full_name: '',
        email: session.user.email,
    })

    useEffect(() => {
        fetchProfile()
    }, [])

    const fetchProfile = async () => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .single()

            if (data) {
                setProfile({
                    ...profile,
                    full_name: data.full_name || '',
                    role: data.role || 'user'
                })
            } else {
                // Should not happen if MeetingBoard synced roles, but fallback exists
                setProfile({ ...profile, role: 'admin' })
            }
        } catch (err) {
            setProfile({ ...profile, role: 'admin' })
        }
    }

    const handleUpdateProfile = async (e) => {
        e.preventDefault()
        setLoading(true)
        const { error } = await supabase
            .from('users')
            .update({ full_name: profile.full_name })
            .eq('id', session.user.id)

        if (error) alert(error.message)
        else alert('Profile updated successfully!')
        setLoading(false)
    }

    return (
        <div className="container animate-fade-in">
            <header className="app-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button className="btn btn-ghost" onClick={onBack} style={{ padding: '0.5rem' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <h1>Account Settings</h1>
                </div>
            </header>

            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                <div className="card">
                    <h2 style={{ fontSize: '1.25rem' }}>My Profile</h2>
                    <p style={{ marginBottom: '2rem' }}>Personalize your information and manage your account.</p>

                    <form onSubmit={handleUpdateProfile}>
                        <div className="form-group">
                            <label className="label">Full Name</label>
                            <div style={{ position: 'relative' }}>
                                <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    className="input"
                                    style={{ paddingLeft: '3rem' }}
                                    value={profile.full_name}
                                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                                    placeholder="Enter your name"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="label">Email Address</label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', opacity: 0.5 }} />
                                <input
                                    className="input"
                                    style={{ paddingLeft: '3rem', cursor: 'not-allowed', background: 'var(--bg-sidebar)' }}
                                    value={profile.email}
                                    readOnly
                                />
                            </div>
                            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Email cannot be changed.</p>
                        </div>

                        <div className="form-group" style={{ marginBottom: '2.5rem' }}>
                            <label className="label">User Role</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--secondary)', fontWeight: 600 }}>
                                <Shield size={18} /> {profile.role?.toLowerCase() === 'admin' ? 'Admin' : 'User'}
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                            {loading ? <Loader2 className="loading-spinner" /> : <><Save size={18} /> Save Changes</>}
                        </button>
                    </form>
                </div>

                <div className="card" style={{ marginTop: '2rem', borderColor: 'var(--error)', backgroundColor: 'rgba(185, 28, 28, 0.02)' }}>
                    <h3 style={{ color: 'var(--error)' }}>Danger Zone</h3>
                    <p>Permanently delete your account and all associated meetings.</p>
                    <button className="btn btn-outline" style={{ color: 'var(--error)', marginTop: '1rem', borderColor: 'var(--error)' }}>
                        Delete Account
                    </button>
                </div>
            </div>
        </div>
    )
}
