import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { clientsAPI, projectsAPI, trackerAPI } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { Plus, ChevronRight, ChevronLeft, Edit2, Trash2, Search, Filter, Target, Download, Link2, FolderOpen, Archive } from 'lucide-react'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import Badge from '../components/Badge'
import { format, parseISO } from 'date-fns'

const EMPTY_FORM = { description: '', classification: 'issue', status: 'pending', raisedDate: format(new Date(), 'yyyy-MM-dd'), devStartDate: '', deployedDate: '', raisedBy: '', remarks: '' }

export default function Tracker() {
  const toast = useToast()
  const { isPM, user, isMember, isSuperAdmin } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const flatMode = searchParams.get('view') === 'all'
  const [step, setStep] = useState(flatMode ? 'tracker' : 'clients')
  const [clients, setClients] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [selected, setSelected] = useState([])

  useEffect(() => {
    if (flatMode) {
      // Flat all-items view — skip client/project drill-down
      setStep('tracker')
      setSelectedClient(null); setSelectedProject(null)
      setLoading(true)
      trackerAPI.list({}).then(setItems).catch(console.error).finally(() => setLoading(false))
      return
    }
    setStep('clients')
    setSelectedClient(null); setSelectedProject(null); setItems([])
    const memberId = isMember ? user?.id : null
    setLoading(true)
    clientsAPI.list(false, memberId).then(setClients).catch(console.error).finally(() => setLoading(false))
  }, [isMember, user?.id, flatMode])

  const selectClient = async (c) => {
    if (c.is_archived) return
    setSelectedClient(c); setStep('projects'); setLoading(true)
    try {
      const memberId = isMember ? user?.id : null
      setProjects(await projectsAPI.list(c.id, memberId))
    } catch (err) { console.warn('[Tracker.loadClients]', err) }
    setLoading(false)
  }

  const selectProject = async (p) => {
    setSelectedProject(p); setStep('tracker'); setLoading(true)
    try { setItems(await trackerAPI.list({ projectId: p.id })) } catch (err) { console.warn('[Tracker.loadProjects]', err) }
    setLoading(false)
  }

  const back = () => {
    if (flatMode) { navigate('/dashboard'); return }
    if (step === 'tracker') { setStep('projects'); setSelectedProject(null); setItems([]); resetFilters() }
    else if (step === 'projects') { setStep('clients'); setSelectedClient(null); setProjects([]) }
  }

  const resetFilters = () => { setSearch(''); setFilterStatus(''); setFilterClass(''); setFromDate(''); setToDate('') }

  const reload = async () => {
    if (flatMode) setItems(await trackerAPI.list({}))
    else if (selectedProject) setItems(await trackerAPI.list({ projectId: selectedProject.id }))
  }

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setError(''); setShowModal(true) }
  const toDateInput = (d) => {
    if (!d) return ''
    return typeof d === 'string' ? d.slice(0, 10) : format(new Date(d), 'yyyy-MM-dd')
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({
      description: item.description, classification: item.classification, status: item.status,
      raisedDate: toDateInput(item.raised_date), devStartDate: toDateInput(item.dev_start_date),
      deployedDate: toDateInput(item.deployed_date), raisedBy: item.raised_by || '', remarks: item.remarks || ''
    })
    setError(''); setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const payload = {
        projectId: selectedProject.id, clientId: selectedClient.id,
        description: form.description, classification: form.classification, status: form.status,
        raisedDate: form.raisedDate || null, devStartDate: form.devStartDate || null,
        deployedDate: form.deployedDate || null, raisedBy: form.raisedBy, remarks: form.remarks
      }
      if (editItem) await trackerAPI.update(editItem.id, payload)
      else await trackerAPI.create(payload)
      setShowModal(false); await reload()
    } catch (err) { setError(err.message) }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    try { await trackerAPI.delete(id); setItems(i => i.filter(x => x.id !== id)) } catch (err) { toast.error(err.message) }
    setConfirm(null)
  }

  const bulkDelete = async () => {
    try { await trackerAPI.bulkDelete(selected); setItems(i => i.filter(x => !selected.includes(x.id))); setSelected([]) } catch (err) { toast.error(err.message) }
    setConfirm(null)
  }

  const updateStatus = async (id, status) => {
    try { await trackerAPI.update(id, { status }); setItems(i => i.map(x => x.id === id ? { ...x, status } : x)) } catch (err) { console.warn('[Tracker.updateStatus]', err) }
  }

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const filtered = items.filter(i => {
    const s = search.toLowerCase()
    return (!s || i.description.toLowerCase().includes(s) || i.classification.toLowerCase().includes(s) || (i.raised_by || '').toLowerCase().includes(s)) &&
      (!filterStatus || i.status === filterStatus) &&
      (!filterClass || i.classification === filterClass) &&
      (!fromDate || (i.raised_date && i.raised_date >= fromDate)) &&
      (!toDate || (i.raised_date && i.raised_date <= toDate))
  })

  // xlsx-js-style is ~900 KB; lazy-loaded on first Export click.
  const exportExcel = async () => {
    let XLSX
    try {
      XLSX = await import('xlsx-js-style')
    } catch (err) {
      console.error('[Tracker.exportExcel load]', err)
      toast.error('Could not load Excel exporter')
      return
    }

    const rows = filtered.map((i, idx) => ({
      'S No': idx + 1,
      'Description': i.description,
      'Classification': i.classification,
      'Status': i.status,
      'Raised By': i.raised_by || '',
      'DOI': i.raised_date ? format(parseISO(i.raised_date), 'dd-MM-yyyy') : '',
      'Dev Start Date': i.dev_start_date ? format(parseISO(i.dev_start_date), 'dd-MM-yyyy') : '',
      'Deployed On': i.deployed_date ? format(parseISO(i.deployed_date), 'dd-MM-yyyy') : '',
      'Remarks': i.remarks || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)

    // Bold header row
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c })
      if (ws[addr]) ws[addr].s = headerStyle
    }

    // Auto-fit column widths based on longest cell (header included)
    const headers = Object.keys(rows[0] || {})
    ws['!cols'] = headers.map(h => {
      let max = h.length
      for (const row of rows) {
        const v = row[h] == null ? '' : String(row[h])
        if (v.length > max) max = v.length
      }
      return { wch: Math.min(Math.max(max + 2, 8), 60) }
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Tracker')
    XLSX.writeFile(wb, `${selectedProject?.name || 'Tracker'}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  const fmtDate = (d) => d ? format(parseISO(d), 'dd MMM yyyy') : '—'


  return (
    <div className="fade-in">
      {step !== 'clients' && !flatMode && (
        <div className="breadcrumb mb-4">
          <span style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => { setStep('clients'); setSelectedClient(null); setSelectedProject(null) }}>Tracker</span>
          {selectedClient && <><span className="breadcrumb-sep">/</span><span style={{ cursor: step === 'projects' ? 'default' : 'pointer', color: step !== 'projects' ? 'var(--primary)' : 'var(--text-muted)' }} onClick={() => step === 'tracker' && back()}>{selectedClient.name}</span></>}
          {selectedProject && <><span className="breadcrumb-sep">/</span><span style={{ color: 'var(--text-muted)' }}>{selectedProject.name}</span></>}
        </div>
      )}

      {/* CLIENTS */}
      {step === 'clients' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div><h1 style={{ marginBottom: '0.25rem' }}>Task Tracker</h1><p>Select a client to view project trackers</p></div>
          </div>
          {loading ? <Spinner large center /> : clients.length === 0 ? (
            <EmptyState icon={Target} title="No clients yet" description="Add a client from the Clients page first" />
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
                      {c.project_name && <p style={{ fontSize: '0.8rem', marginTop: 2 }}>{c.project_name}</p>}
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
              <button className="flex items-center gap-1 text-sm" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginBottom: 8 }} onClick={back}><ChevronLeft size={16} />Back</button>
              <h1 style={{ marginBottom: '0.25rem' }}>{selectedClient?.name}</h1><p>Select a project</p>
            </div>
          </div>
          {loading ? <Spinner large center /> : projects.length === 0 ? (
            <EmptyState icon={FolderOpen} title="No projects" description="Create a project from the Meetings section first" />
          ) : (
            <div className="grid-auto">
              {projects.map(p => (
                <div key={p.id} className="card card-hover" style={{ cursor: 'pointer' }} onClick={() => selectProject(p)}>
                  <div className="flex items-center justify-between mb-2">
                    <div style={{ width: 36, height: 36, borderRadius: 'var(--radius)', background: 'var(--secondary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--secondary)' }}><Target size={18} /></div>
                    <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <h4>{p.name}</h4>
                  <p style={{ fontSize: '0.75rem', marginTop: 6 }}>{p.tracker_count} item{Number(p.tracker_count) !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* TRACKER ITEMS */}
      {step === 'tracker' && (
        <>
          <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <button className="flex items-center gap-1 text-sm" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginBottom: 8 }} onClick={back}><ChevronLeft size={16} />Back</button>
              <h1 style={{ marginBottom: '0.25rem' }}>{flatMode ? 'All Tracker Items' : `${selectedProject?.name} — Tracker`}</h1>
              <p>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              {selected.length > 0 && isPM && <button className="btn btn-danger-outline btn-sm" onClick={() => setConfirm({ bulk: true })}><Trash2 size={13} />Delete ({selected.length})</button>}
              <button className="btn btn-outline btn-sm" onClick={exportExcel}><Download size={13} />Excel</button>
              {isPM && !flatMode && <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={14} />Add Item</button>}
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
            <div className="input-icon-wrap" style={{ flex: '1 1 200px', maxWidth: 260 }}>
              <Search size={14} className="icon" />
              <input className="input" placeholder="Search tracker..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
            <select className="input" style={{ width: 'auto' }} value={filterClass} onChange={e => setFilterClass(e.target.value)}>
              <option value="">All Types</option>
              <option value="issue">Issue</option>
              <option value="new_requirement">New Requirement</option>
              <option value="change_request">Change Request</option>
              <option value="tbd">TBD</option>
            </select>
            <div className="flex items-center gap-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.35rem 0.625rem' }}>
              <Filter size={12} style={{ color: 'var(--text-muted)' }} />
              <input type="date" style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', color: 'var(--text-main)', outline: 'none', width: 120 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
              <span style={{ color: 'var(--text-light)', fontSize: '0.75rem' }}>–</span>
              <input type="date" style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', color: 'var(--text-main)', outline: 'none', width: 120 }} value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
            {(search || filterStatus || filterClass || fromDate || toDate) && <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Clear</button>}
          </div>

          {loading ? <Spinner large center /> : filtered.length === 0 ? (
            <EmptyState icon={Target} title="No tracker items"
              action={isPM ? <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={14} />Add Item</button> : null} />
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap" style={{ border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      {isPM && (
                        <th className="th-checkbox">
                          <input
                            type="checkbox"
                            checked={selected.length === filtered.length && filtered.length > 0}
                            onChange={e => setSelected(e.target.checked ? filtered.map(i => i.id) : [])}
                          />
                        </th>
                      )}

                      <th style={{ width: 50 }}>S No</th>
                      <th>Description</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Raised By</th>
                      <th>Raised On</th>
                      <th>Dev Start</th>
                      <th>Deployed</th>
                      <th>Link</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map((item, idx) => (
                      <tr key={item.id}>
                        {isPM && (
                          <td className="td-checkbox">
                            <input
                              type="checkbox"
                              checked={selected.includes(item.id)}
                              onChange={e =>
                                setSelected(s =>
                                  e.target.checked
                                    ? [...s, item.id]
                                    : s.filter(x => x !== item.id)
                                )
                              }
                            />
                          </td>
                        )}
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ maxWidth: 240 }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{item.description}</span>
                          {item.remarks && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.remarks}</span>}
                        </td>
                        <td><Badge value={item.classification} /></td>
                        <td>
                          <select value={item.status} onChange={e => updateStatus(item.id, e.target.value)}
                            className={`badge badge-${item.status}`}
                            style={{ border: 'none', outline: 'none', cursor: 'pointer', background: 'transparent' }}>
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="closed">Closed</option>
                          </select>
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{item.raised_by || '—'}</td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(item.raised_date)}</td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(item.dev_start_date)}</td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(item.deployed_date)}</td>
                        <td>
                          {item.action_item_id && <span className="tracked-badge" title={item.action_item_title}><Link2 size={10} />Linked</span>}
                        </td>
                          <td style={{ textAlign: 'right' }}>
                            <div
                              className="flex items-center gap-1"
                              style={{ justifyContent: 'flex-end' }}
                            >
                              <button
                                className="btn-ghost"
                                onClick={() => openEdit(item)}
                              >
                                <Edit2 size={14} />
                              </button>

                              {isSuperAdmin && (
                                <button
                                  className="btn-ghost"
                                  style={{ color: 'var(--error)' }}
                                  onClick={() => setConfirm({ id: item.id })}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={editItem ? 'Edit Tracker Item' : 'New Tracker Item'} onClose={() => setShowModal(false)} maxWidth="580px"
          footer={<><button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : editItem ? 'Save' : 'Create'}</button></>}>
          {error && <div className="alert alert-error mb-4">{error}</div>}
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {!isPM && (
              <div
                className="alert alert-warning mb-2"
                style={{ fontSize: '0.8rem' }}
              >
                As a member, you can only update Dev Start Date and Deployed Date.
              </div>
            )}            
            <div className="form-group"><label className="label">Description *</label>
              <textarea
                className="textarea"
                style={{
                  minHeight: 80,
                  opacity: isPM ? 1 : 0.5
                }}
                value={form.description}
                onChange={setF('description')}
                disabled={!isPM}
                required
                autoFocus
              />
              <div className="form-group">
                <label className="label">Classification</label>
                  <select
                    className="input"
                    value={form.classification}
                    onChange={setF('classification')}
                    disabled={!isPM}
                    style={{ opacity: isPM ? 1 : 0.5 }}
                  >
                  <option value="issue">Issue</option>
                  <option value="new_requirement">New Requirement</option>
                  <option value="change_request">Change Request</option>
                  <option value="tbd">TBD</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Status</label>
                  <select
                    className="input"
                    value={form.status}
                    onChange={setF('status')}
                    disabled={!isPM}
                    style={{ opacity: isPM ? 1 : 0.5 }}
                  >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
            <div className="form-group"><label className="label">Raised By</label>
            <input
              className="input"
              value={form.raisedBy}
              onChange={setF('raisedBy')}
              disabled={!isPM}
              style={{ opacity: isPM ? 1 : 0.5 }}
            />            
            </div>
            <div className="grid-3">
              {/* <div className="form-group"><label className="label">Raised On</label><input type="date" className="input" value={form.raisedDate} onChange={setF('raisedDate')} /></div> */}
              <div className="form-group"><label className="label">Dev Start Date</label>
                <input
                  type="date"
                  className="input"
                  value={form.devStartDate}
                  onChange={setF('devStartDate')}
                  disabled={!(isMember || isSuperAdmin)}
                  style={{ opacity: (isMember || isSuperAdmin) ? 1 : 0.5 }}
                />
              </div>
              <div className="form-group"><label className="label">Deployed On</label>
                <input
                  type="date"
                  className="input"
                  value={form.deployedDate}
                  onChange={setF('deployedDate')}
                  disabled={!(isMember || isSuperAdmin)}
                  style={{ opacity: (isMember || isSuperAdmin) ? 1 : 0.5 }}
                />
              </div>
            </div>
            <div className="form-group"><label className="label">Remarks</label><textarea className="textarea" style={{ minHeight: 60 }} value={form.remarks} onChange={setF('remarks')} /></div>
          </form>
        </Modal>
      )}

      {confirm && !confirm.bulk && <ConfirmDialog title="Delete Item" message="Delete this tracker item?" onConfirm={() => handleDelete(confirm.id)} onCancel={() => setConfirm(null)} />}
      {confirm?.bulk && <ConfirmDialog title="Bulk Delete" message={`Delete ${selected.length} item(s)?`} onConfirm={bulkDelete} onCancel={() => setConfirm(null)} />}
    </div>
  )
}
