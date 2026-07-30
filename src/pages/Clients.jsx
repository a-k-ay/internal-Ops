import { useState, useEffect } from 'react'
import { clientsAPI } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { Plus, Search, Edit2, Archive, RotateCcw, Building2, Phone, Mail, User } from 'lucide-react'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import Badge from '../components/Badge'

const EMPTY_FORM = { name: '', contactPerson: '', contactEmail: '', contactPhone: '', industry: '' }

export default function Clients() {
  const { isPM } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)

  const load = async () => {
    setLoading(true)
    try { setClients(await clientsAPI.list(showArchived)) } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [showArchived])

  const openAdd = () => { setEditClient(null); setForm(EMPTY_FORM); setError(''); setShowModal(true) }
  const openEdit = (c) => {
    setEditClient(c)
    setForm({ name: c.name, contactPerson: c.contact_person || '', contactEmail: c.contact_email || '', contactPhone: c.contact_phone || '', industry: c.industry || '' })
    setError(''); setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      if (editClient) await clientsAPI.update(editClient.id, form)
      else await clientsAPI.create(form)
      setShowModal(false); load()
    } catch (err) { setError(err.message) }
    setSaving(false)
  }

  const handleArchive = async (c) => {
    try { await clientsAPI.archive(c.id); load() } catch {}
    setConfirm(null)
  }

  const handleRestore = async (id) => {
    try { await clientsAPI.restore(id); load() } catch {}
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const filtered = clients.filter(c => {
    if (showArchived && !c.is_archived) return false
    const s = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(s) ||
      (c.contact_person || '').toLowerCase().includes(s)
    )
  })

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Clients</h1>
          <p>{filtered.length} client{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className={`btn btn-outline btn-sm`} onClick={() => setShowArchived(s => !s)}>
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
          {isPM && <button className="btn btn-primary" onClick={openAdd}><Plus size={16} />Add Client</button>}
        </div>
      </div>

      {/* Search */}
      <div className="input-icon-wrap" style={{ maxWidth: 340, marginBottom: '1.25rem' }}>
        <Search size={15} className="icon" />
        <input className="input" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <Spinner large center /> : filtered.length === 0 ? (
        <EmptyState icon={Building2} title="No clients found"
          description={search ? 'Try adjusting your search' : 'Add your first client to get started'}
          action={isPM && !search ? <button className="btn btn-primary" onClick={openAdd}><Plus size={16} />Add Client</button> : null} />
      ) : (
        <div className="grid-auto">
          {filtered.map(c => (
            <div key={c.id} className={`card card-hover`} style={{ opacity: c.is_archived ? 0.7 : 1 }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div style={{ width: 36, height: 36, borderRadius: 'var(--radius)', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
                    <Building2 size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h4 className="truncate">{c.name}</h4>
                  </div>
                </div>
                {c.is_archived && <Badge value="archived" />}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', margin: '0.75rem 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                {c.contact_person && <span className="flex items-center gap-2"><User size={13} />{c.contact_person}</span>}
                {c.contact_email && <span className="flex items-center gap-2"><Mail size={13} />{c.contact_email}</span>}
                {c.contact_phone && <span className="flex items-center gap-2"><Phone size={13} />{c.contact_phone}</span>}
                {c.industry && <span style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>{c.industry}</span>}
              </div>

              {isPM && (
                <div className="flex gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                  <button className="btn btn-outline btn-sm flex-1" onClick={() => openEdit(c)}><Edit2 size={13} />Edit</button>
                  {c.is_archived
                    ? <button className="btn btn-outline btn-sm flex-1" onClick={() => handleRestore(c.id)}><RotateCcw size={13} />Restore</button>
                    : <button className="btn btn-outline btn-sm flex-1" style={{ color: 'var(--warning)' }} onClick={() => setConfirm(c)}><Archive size={13} />Archive</button>
                  }
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={editClient ? 'Edit Client' : 'Add Client'} onClose={() => setShowModal(false)} maxWidth="480px"
          footer={<>
            <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : editClient ? 'Save Changes' : 'Add Client'}</button>
          </>}>
          {error && <div className="alert alert-error mb-4">{error}</div>}
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div className="form-group"><label className="label">Client Name *</label><input className="input" value={form.name} onChange={set('name')} required autoFocus /></div>
            <div className="grid-2">
              <div className="form-group"><label className="label">Contact Person</label><input className="input" value={form.contactPerson} onChange={set('contactPerson')} /></div>
              <div className="form-group">
              <label className="label">Contact Phone</label>
              <input
                className="input"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={form.contactPhone}
                onChange={(e) =>
                  setForm(f => ({
                    ...f,
                    contactPhone: e.target.value.replace(/\D/g, '').slice(0, 10)
                  }))
                }
              />
            </div>
            </div>
            <div className="form-group"><label className="label">Contact Email</label><input className="input" type="email" value={form.contactEmail} onChange={set('contactEmail')} /></div>
            <div className="form-group"><label className="label">Industry</label><input className="input" value={form.industry} onChange={set('industry')} /></div>
          </form>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog title="Archive Client" message={`Archive "${confirm.name}"? All meetings and tracker data will be preserved as read-only.`}
          onConfirm={() => handleArchive(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
