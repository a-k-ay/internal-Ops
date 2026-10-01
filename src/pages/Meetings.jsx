import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { clientsAPI, projectsAPI, meetingsAPI } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { Plus, Calendar, ChevronRight, ChevronLeft, Edit2, Trash2, Search, Filter, FolderOpen, Archive } from 'lucide-react'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { format, parseISO } from 'date-fns'

const EMPTY_MTG = { title: '', date: format(new Date(), 'yyyy-MM-dd'), attendees: '', venue: '', duration: '', objective: '' }
const EMPTY_PROJ = { name: '', description: '' }

export default function Meetings() {
  const toast = useToast()
  const { isPM, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const flatMode = searchParams.get('view') === 'all'
  const [step, setStep] = useState(flatMode ? 'meetings' : 'clients') // clients | projects | meetings
  const [clients, setClients] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [showMtgModal, setShowMtgModal] = useState(false)
  const [showProjModal, setShowProjModal] = useState(false)
  const [editMtg, setEditMtg] = useState(null)
  const [editProj, setEditProj] = useState(null)
  const [mtgForm, setMtgForm] = useState(EMPTY_MTG)
  const [projForm, setProjForm] = useState(EMPTY_PROJ)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [selectedMtgs, setSelectedMtgs] = useState([])
  const [attendeeInput, setAttendeeInput] = useState('')
  const [attendeePills, setAttendeePills] = useState([])

  useEffect(() => {
    if (flatMode) {
      setStep('meetings')
      setSelectedClient(null); setSelectedProject(null)
      setLoading(true)
      meetingsAPI.list({}).then(setMeetings).catch(console.error).finally(() => setLoading(false))
      return
    }
    setStep('clients')
    setSelectedClient(null); setSelectedProject(null); setMeetings([])
    setLoading(true)
    clientsAPI.list(true).then(setClients).catch(console.error).finally(() => setLoading(false))
  }, [flatMode])

  const selectClient = async (c) => {
    if (c.is_archived) return
    setSelectedClient(c); setStep('projects'); setLoading(true)
    try { setProjects(await projectsAPI.list(c.id)) } catch (err) { console.warn('[Meetings.loadProjects]', err) }
    setLoading(false)
  }

  const selectProject = async (p) => {
    setSelectedProject(p); setStep('meetings'); setLoading(true)
    try { setMeetings(await meetingsAPI.list({ projectId: p.id })) } catch (err) { console.warn('[Meetings.loadMeetings]', err) }
    setLoading(false)
  }

  const back = () => {
    if (flatMode) { navigate('/dashboard'); return }
    if (step === 'meetings') { setStep('projects'); setSelectedProject(null); setMeetings([]); setSearch(''); setFromDate(''); setToDate('') }
    else if (step === 'projects') { setStep('clients'); setSelectedClient(null); setProjects([]) }
  }

  // Meeting CRUD
  const openAddMtg = () => { setEditMtg(null); setMtgForm(EMPTY_MTG); setAttendeePills([]); setAttendeeInput(''); setError(''); setShowMtgModal(true) }
  const openEditMtg = (m) => {
    setEditMtg(m)
    const pills = (m.attendees || '').split(',').map(s => s.trim()).filter(Boolean)
    setAttendeePills(pills)
    setAttendeeInput('')
    setMtgForm({ title: m.title, date: m.date, attendees: m.attendees || '', venue: m.venue || '', duration: m.duration || '', objective: m.objective || '' })
    setError(''); setShowMtgModal(true)
  }
  const saveMtg = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const allPills = attendeeInput.trim() ? [...attendeePills, attendeeInput.trim()] : attendeePills
      const payload = { ...mtgForm, attendees: allPills.join(', '), projectId: selectedProject.id, clientId: selectedClient.id }
      if (editMtg) await meetingsAPI.update(editMtg.id, payload)
      else await meetingsAPI.create(payload)
      setShowMtgModal(false)
      setMeetings(await meetingsAPI.list({ projectId: selectedProject.id }))
    } catch (err) { setError(err.message) }
    setSaving(false)
  }
  const deleteMtg = async (id) => {
    try { await meetingsAPI.delete(id); setMeetings(m => m.filter(x => x.id !== id)) } catch (err) { toast.error(err.message) }
    setConfirm(null)
  }

  // Project CRUD
  const openAddProj = () => { setEditProj(null); setProjForm(EMPTY_PROJ); setError(''); setShowProjModal(true) }
  const deleteProj = async (id) => {
    try {
      await projectsAPI.delete(id)
      setProjects(ps => ps.filter(p => p.id !== id))
    } catch (err) { toast.error(err.message) }
    setConfirm(null)
  }
  const saveProj = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      if (editProj) { await projectsAPI.update(editProj.id, { ...projForm }); setProjects(await projectsAPI.list(selectedClient.id)) }
      else { await projectsAPI.create({ clientId: selectedClient.id, ...projForm }); setProjects(await projectsAPI.list(selectedClient.id)) }
      setShowProjModal(false)
    } catch (err) { setError(err.message) }
    setSaving(false)
  }

  const setMF = (k) => (e) => setMtgForm(f => ({ ...f, [k]: e.target.value }))
  const setPF = (k) => (e) => setProjForm(f => ({ ...f, [k]: e.target.value }))

  const filteredMtgs = meetings.filter(m => {
    const s = search.toLowerCase()
    const matchSearch = !s || m.title.toLowerCase().includes(s) || (m.attendees || '').toLowerCase().includes(s)
    const matchFrom = !fromDate || m.date >= fromDate
    const matchTo = !toDate || m.date <= toDate
    return matchSearch && matchFrom && matchTo
  })


  return (
    <div className="fade-in">
      {step !== 'clients' && !flatMode && (
        <div className="breadcrumb mb-4">
          <span style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => { setStep('clients'); setSelectedClient(null); setSelectedProject(null) }}>Meetings</span>
          {selectedClient && <><span className="breadcrumb-sep">/</span><span style={{ cursor: step === 'projects' ? 'default' : 'pointer', color: step !== 'projects' ? 'var(--primary)' : 'var(--text-muted)' }} onClick={() => step === 'meetings' && back()}>{selectedClient.name}</span></>}
          {selectedProject && <><span className="breadcrumb-sep">/</span><span style={{ color: 'var(--text-muted)' }}>{selectedProject.name}</span></>}
        </div>
      )}

      {/* CLIENTS */}
      {step === 'clients' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div><h1 style={{ marginBottom: '0.25rem' }}>Meetings</h1><p>Select a client to view projects and meetings</p></div>
          </div>
          {loading ? <Spinner large center /> : clients.length === 0 ? (
            <EmptyState icon={Calendar} title="No clients yet" description="Add a client first from the Clients page" />
          ) : (
            <div className="grid-auto">
              {clients.map(c => (
                <div key={c.id} className={`card${c.is_archived ? '' : ' card-hover'}`}
                  style={{ cursor: c.is_archived ? 'not-allowed' : 'pointer', opacity: c.is_archived ? 0.65 : 1 }}
                  onClick={() => selectClient(c)}>
                  <div className="flex items-center justify-between">
                    <div style={{ minWidth: 0 }}>
                      <div className="flex items-center gap-2">
                        <h4 className="truncate">{c.name}</h4>
                        {c.is_archived && (
                          <span className="flex items-center gap-1" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-muted, #f1f1f1)', borderRadius: 4, padding: '0.1rem 0.4rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            <Archive size={10} />archived
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '0.75rem', marginTop: 4 }}>{c.project_count} project{Number(c.project_count) !== 1 ? 's' : ''}</p>
                    </div>
                    {!c.is_archived && <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* PROJECTS */}
      {step === 'projects' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <button className="flex items-center gap-1 text-sm text-muted mb-2" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={back}><ChevronLeft size={16} />Back</button>
              <h1 style={{ marginBottom: '0.25rem' }}>{selectedClient?.name}</h1>
              <p>Select a project to view meetings</p>
            </div>
            {isPM && <button className="btn btn-primary" onClick={openAddProj}><Plus size={16} />New Project</button>}
          </div>
          {loading ? <Spinner large center /> : projects.length === 0 ? (
            <EmptyState icon={FolderOpen} title="No projects yet" description="Create a project to start adding meetings"
              action={isPM ? <button className="btn btn-primary" onClick={openAddProj}><Plus size={16} />New Project</button> : null} />
          ) : (
            <div className="grid-auto">
              {projects.map(p => (
                <div key={p.id} className="card card-hover" style={{ cursor: 'pointer' }} onClick={() => selectProject(p)}>
                  <div className="flex items-center justify-between mb-2">
                    <div style={{ width: 36, height: 36, borderRadius: 'var(--radius)', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                      <FolderOpen size={18} />
                    </div>
                    <div className="flex items-center gap-1">
                      {isPM && <button className="btn-ghost" onClick={e => { e.stopPropagation(); setEditProj(p); setProjForm({ name: p.name, description: p.description || '' }); setShowProjModal(true) }}><Edit2 size={14} /></button>}
                      {isSuperAdmin && <button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={e => { e.stopPropagation(); setConfirm({ projId: p.id, projName: p.name }) }}><Trash2 size={14} /></button>}
                      <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  </div>
                  <h4>{p.name}</h4>
                  <p style={{ fontSize: '0.75rem', marginTop: 8, color: 'var(--text-muted)' }}>{p.meeting_count} meeting{Number(p.meeting_count) !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* MEETINGS */}
      {step === 'meetings' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <button className="flex items-center gap-1 text-sm" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginBottom: 8 }} onClick={back}><ChevronLeft size={16} />Back</button>
              <h1 style={{ marginBottom: '0.25rem' }}>{flatMode ? 'All Meetings' : selectedProject?.name}</h1>
              {!flatMode && selectedProject?.description && <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{selectedProject.description}</p>}
              <p>{filteredMtgs.length} meeting{filteredMtgs.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedMtgs.length > 0 && isSuperAdmin && (
                <button className="btn btn-danger-outline btn-sm" onClick={() => setConfirm({ bulk: true })}>
                  <Trash2 size={14} />Delete ({selectedMtgs.length})
                </button>
              )}
              {isPM && !flatMode && <button className="btn btn-primary" onClick={openAddMtg}><Plus size={16} />New Meeting</button>}
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
            <div className="input-icon-wrap" style={{ flex: '1 1 220px', maxWidth: 300 }}>
              <Search size={14} className="icon" />
              <input className="input" placeholder="Search meetings..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.375rem 0.75rem' }}>
              <Filter size={13} style={{ color: 'var(--text-muted)' }} />
              <input type="date" className="input" style={{ border: 'none', background: 'transparent', padding: '0', width: 130, fontSize: '0.8125rem' }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
              <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>–</span>
              <input type="date" className="input" style={{ border: 'none', background: 'transparent', padding: '0', width: 130, fontSize: '0.8125rem' }} value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
            {(search || fromDate || toDate) && <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFromDate(''); setToDate('') }}>Clear</button>}
          </div>

          {loading ? <Spinner large center /> : filteredMtgs.length === 0 ? (
            <EmptyState icon={Calendar} title="No meetings found"
              action={isPM && !search ? <button className="btn btn-primary" onClick={openAddMtg}><Plus size={16} />New Meeting</button> : null} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {isSuperAdmin && (
                <div className="flex items-center gap-2 mb-1">
                  <input type="checkbox" checked={selectedMtgs.length === filteredMtgs.length && filteredMtgs.length > 0}
                    onChange={e => setSelectedMtgs(e.target.checked ? filteredMtgs.map(m => m.id) : [])} />
                  <span className="text-xs text-muted">Select all</span>
                </div>
              )}
              {filteredMtgs.map(m => (
                <div key={m.id} className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                  <div className="flex items-center gap-3">
                    {isSuperAdmin && (
                      <input type="checkbox" checked={selectedMtgs.includes(m.id)}
                        onChange={e => { e.stopPropagation(); setSelectedMtgs(s => e.target.checked ? [...s, m.id] : s.filter(x => x !== m.id)) }}
                        onClick={e => e.stopPropagation()} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }} onClick={() => navigate(`/meetings/${m.id}`)}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="truncate">{m.title}</h4>
                          <p style={{ fontSize: '0.8125rem', marginTop: 2 }}>{Number(m.open_action_count) > 0 ? `${m.open_action_count} open action${Number(m.open_action_count) !== 1 ? 's' : ''}` : 'No open actions'} · {m.action_count} total</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{format(parseISO(m.date), 'MMM d, yyyy')}</span>
                          {isPM && (
                            <button className="btn-ghost" onClick={e => { e.stopPropagation(); openEditMtg(m) }}><Edit2 size={14} /></button>
                          )}
                          {isSuperAdmin && (
                            <button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={e => { e.stopPropagation(); setConfirm({ id: m.id, title: m.title }) }}><Trash2 size={14} /></button>
                          )}
                          <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Meeting Modal */}
      {showMtgModal && (
        <Modal title={editMtg ? 'Edit Meeting' : 'New Meeting'} onClose={() => setShowMtgModal(false)} maxWidth="640px"
          footer={<><button className="btn btn-outline" onClick={() => setShowMtgModal(false)}>Cancel</button><button className="btn btn-primary" onClick={saveMtg} disabled={saving}>{saving ? <span className="spinner" /> : editMtg ? 'Save' : 'Create Meeting'}</button></>}>
          {error && <div className="alert alert-error mb-4">{error}</div>}
          <form onSubmit={saveMtg} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div className="grid-2">
              <div className="form-group"><label className="label">Title *</label><input className="input" value={mtgForm.title} onChange={setMF('title')} required autoFocus /></div>
              <div className="form-group"><label className="label">Date *</label><input type="date" className="input" value={mtgForm.date} onChange={setMF('date')} required /></div>
            </div>
            <div className="grid-2">
              <div className="form-group"><label className="label">Attendees</label>
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.375rem 0.5rem', background: 'var(--bg-card)', minHeight: 40 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: attendeePills.length ? '0.375rem' : 0 }}>
                    {attendeePills.map((pill, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--primary-soft)', color: 'var(--primary)', borderRadius: 9999, padding: '0.15rem 0.5rem', fontSize: '0.8rem', fontWeight: 500 }}>
                        {pill}
                        <button type="button" onClick={() => setAttendeePills(ps => ps.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 0, lineHeight: 1, fontSize: '1rem' }}>×</button>
                      </span>
                    ))}
                  </div>
                  <input
                    className="input"
                    style={{ border: 'none', background: 'transparent', padding: 0, outline: 'none', fontSize: '0.875rem', width: '100%' }}
                    placeholder="Type name, press Enter or comma..."
                    value={attendeeInput}
                    onChange={e => setAttendeeInput(e.target.value)}
                    onPaste={e => {
                      const text = e.clipboardData.getData('text')
                      if (text.includes(',')) {
                        e.preventDefault()
                        const parts = text.split(',').map(s => s.trim()).filter(Boolean)
                        if (parts.length) {
                          setAttendeePills(ps => [...ps, ...parts])
                          setAttendeeInput('')
                        }
                      }
                    }}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === ',') && attendeeInput.trim()) {
                        e.preventDefault()
                        setAttendeePills(ps => [...ps, attendeeInput.trim()])
                        setAttendeeInput('')
                      }
                    }}
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group"><label className="label">Venue</label><input className="input" placeholder="Room A / Online" value={mtgForm.venue} onChange={setMF('venue')} /></div>
                <div className="form-group"><label className="label">Duration</label><input className="input" placeholder="60 min" value={mtgForm.duration} onChange={setMF('duration')} /></div>
              </div>
            </div>
            <div className="form-group"><label className="label">Objective</label><input className="input" placeholder="Goal of this meeting" value={mtgForm.objective} onChange={setMF('objective')} /></div>
          </form>
        </Modal>
      )}

      {/* Project Modal */}
      {showProjModal && (
        <Modal title={editProj ? 'Edit Project' : 'New Project'} onClose={() => setShowProjModal(false)} maxWidth="440px"
          footer={<><button className="btn btn-outline" onClick={() => setShowProjModal(false)}>Cancel</button><button className="btn btn-primary" onClick={saveProj} disabled={saving}>{saving ? <span className="spinner" /> : editProj ? 'Save' : 'Create'}</button></>}>
          {error && <div className="alert alert-error mb-4">{error}</div>}
          <form onSubmit={saveProj} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div className="form-group"><label className="label">Project Name *</label><input className="input" value={projForm.name} onChange={setPF('name')} required autoFocus /></div>
            <div className="form-group"><label className="label">Description</label><textarea className="textarea" style={{ minHeight: 72 }} value={projForm.description} onChange={setPF('description')} /></div>
          </form>
        </Modal>
      )}

      {confirm && !confirm.bulk && !confirm.projId && (
        <ConfirmDialog title="Delete Meeting" message={`Delete "${confirm.title}"? All action items will be removed.`}
          onConfirm={() => deleteMtg(confirm.id)} onCancel={() => setConfirm(null)} />
      )}
      {confirm?.bulk && (
        <ConfirmDialog title="Delete Meetings" message={`Delete ${selectedMtgs.length} meeting(s)? This cannot be undone.`}
          onConfirm={async () => { for (const id of selectedMtgs) await meetingsAPI.delete(id).catch(() => {}); setMeetings(m => m.filter(x => !selectedMtgs.includes(x.id))); setSelectedMtgs([]); setConfirm(null) }}
          onCancel={() => setConfirm(null)} />
      )}
      {confirm?.projId && (
        <ConfirmDialog title="Delete Project" message={`Delete "${confirm.projName}"? All meetings and tracker items inside will be permanently removed.`}
          onConfirm={() => deleteProj(confirm.projId)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
