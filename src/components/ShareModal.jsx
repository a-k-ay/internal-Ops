import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { X, UserPlus, Trash2, Mail, Shield, ShieldCheck, Loader2 } from 'lucide-react'

export default function ShareModal({ type, targetId, targetTitle, inviterName, onClose }) {
    const [email, setEmail] = useState('')
    const [role, setRole] = useState('Viewer')
    const [shares, setShares] = useState([])
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(false)

    const shareTable = type === 'meeting' ? 'meeting_shares' : 'client_shares'
    const shareKey = type === 'meeting' ? 'meeting_id' : 'client_id'

    useEffect(() => {
        fetchShares()
    }, [targetId, shareTable, shareKey])

    const fetchShares = async () => {
        if (!targetId) return
        setFetching(true)
        const { data } = await supabase
            .from(shareTable)
            .select('*')
            .eq(shareKey, targetId)
        setShares(data || [])
        setFetching(false)
    }

    const sendInviteEmail = async (recipientEmail) => {
        const apiKey = import.meta.env.VITE_RESEND_API_KEY
        if (!apiKey) {
            console.warn('RESEND_API_KEY not found in environment.')
            return
        }

        try {
            const appUrl = window.location.origin;
            // Using local vite proxy to bypass CORS for development
            const response = await fetch('/resend-api/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    from: 'C2 Action Board <onboarding@resend.dev>',
                    to: [recipientEmail],
                    subject: `Invite: You've been given access to ${targetTitle}`,
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                            <h2 style="color: #d97706;">Collaboration Invite</h2>
                            <p>Hello,</p>
                            <p><strong>${inviterName || 'A colleague'}</strong> has invited you to access the <strong>${type}</strong>: "${targetTitle}" with the role of <strong>${role}</strong>.</p>
                            <div style="margin: 25px 0;">
                                <a href="${appUrl}" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">View Action Board</a>
                            </div>
                            <p style="font-size: 14px; color: #6b7280;">If the button doesn't work, copy and paste this link: <br/> <a href="${appUrl}" style="color: #d97706;">${appUrl}</a></p>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                            <p style="font-size: 12px; color: #6b7280;">This is an automated message from C2 Action Board.</p>
                        </div>
                    `
                })
            })

            const result = await response.json()
            if (!response.ok) {
                console.error('Email failed:', result)
            } else {
                console.log('Email sent successfully:', result)
            }
        } catch (error) {
            console.error('Error sending email:', error)
        }
    }

    const handleShare = async (e) => {
        e.preventDefault()
        setLoading(true)
        const normalizedEmail = email.toLowerCase().trim()
        const { error } = await supabase
            .from(shareTable)
            .insert([{
                [shareKey]: targetId,
                user_email: normalizedEmail,
                role: role
            }])

        if (error) {
            alert(error.message)
        } else {
            // Trigger email send
            await sendInviteEmail(normalizedEmail)
            setEmail('')
            fetchShares()
        }
        setLoading(false)
    }

    const removeShare = async (id) => {
        const { error } = await supabase
            .from(shareTable)
            .delete()
            .eq('id', id)
        if (!error) fetchShares()
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h2 style={{ marginBottom: '0.25rem' }}>Share {type === 'meeting' ? 'Meeting' : 'Client Access'}</h2>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{targetTitle}</p>
                    </div>
                    <button className="btn-ghost" onClick={onClose}><X size={24} /></button>
                </div>

                <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>Invite colleagues to view or edit this {type === 'meeting' ? 'meeting action board' : 'client record'}.</p>

                <form onSubmit={handleShare} style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Mail size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            className="input"
                            style={{ paddingLeft: '2.5rem' }}
                            placeholder="colleague@office.com"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <select className="input" style={{ width: 'auto' }} value={role} onChange={(e) => setRole(e.target.value)}>
                        <option value="Viewer">Viewer</option>
                        <option value="Editor">Editor</option>
                    </select>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? <Loader2 className="loading-spinner" /> : 'Invite'}
                    </button>
                </form>

                <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1rem' }}>People with access</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {fetching ? (
                        <div style={{ textAlign: 'center', padding: '1rem' }}><Loader2 className="loading-spinner" style={{ margin: '0 auto' }} /></div>
                    ) : shares.length === 0 ? (
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No one else has access yet.</p>
                    ) : (
                        shares.map((share) => (
                            <div key={share.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: 'var(--bg-sidebar)', borderRadius: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ padding: '0.4rem', borderRadius: '0.4rem', backgroundColor: 'var(--bg-card)' }}>
                                        {share.role === 'Editor' ? <ShieldCheck size={16} color="var(--primary)" /> : <Shield size={16} color="var(--text-muted)" />}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{share.user_email}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{share.role}</div>
                                    </div>
                                </div>
                                <button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => removeShare(share.id)}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
