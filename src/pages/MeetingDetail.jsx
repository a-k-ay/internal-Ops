import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { meetingsAPI, actionItemsAPI, trackerAPI, usersAPI, aiAPI } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { ChevronLeft, Plus, Edit2, Trash2, Download, Sparkles, Link2, CheckSquare, AlertCircle, FileText } from 'lucide-react'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import Badge from '../components/Badge'
import { format, parseISO, isPast } from 'date-fns'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const EMPTY_ACTION = { title: '', assignedTo: '', assignedToName: '', dueDate: '' }

export default function MeetingDetail() {
  const toast = useToast()
  const { meetingId } = useParams()
  const { isPM, isSuperAdmin } = useAuth()
  const navigate = useNavigate()

  const [meeting, setMeeting] = useState(null)
  const [actions, setActions] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showActionModal, setShowActionModal] = useState(false)
  const [editAction, setEditAction] = useState(null)
  const [actionForm, setActionForm] = useState(EMPTY_ACTION)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [selectedActions, setSelectedActions] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiNotes, setAiNotes] = useState('')
  const [showAiModal, setShowAiModal] = useState(false)
  const [showTrackerModal, setShowTrackerModal] = useState(false)
  const [trackerAction, setTrackerAction] = useState(null)
  const [trackerForm, setTrackerForm] = useState({ classification: 'issue', raisedDate: format(new Date(), 'yyyy-MM-dd'), remarks: '' })
  const [trackedWarning, setTrackedWarning] = useState(null)

  useEffect(() => {
    loadAll()
  }, [meetingId])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [mtg, acts, userList] = await Promise.all([
        meetingsAPI.get(meetingId),
        actionItemsAPI.list({ meetingId }),
        usersAPI.list().catch(() => [])
      ])
      setMeeting(mtg)
      setActions(acts)
      setUsers(userList)
    } catch { navigate('/meetings') }
    setLoading(false)
  }

  // Action CRUD
  const openAddAction = () => { setEditAction(null); setActionForm(EMPTY_ACTION); setError(''); setShowActionModal(true) }
  const openEditAction = (a) => {
    setEditAction(a)
    setActionForm({ title: a.title, assignedTo: a.assigned_to || '', assignedToName: a.assigned_to_name || '', dueDate: a.due_date || '' })
    setError(''); setShowActionModal(true)
  }

  const saveAction = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const payload = { ...actionForm, meetingId: meeting.id, projectId: meeting.project_id, clientId: meeting.client_id }
      if (editAction) await actionItemsAPI.update(editAction.id, payload)
      else await actionItemsAPI.create(payload)
      setShowActionModal(false)
      setActions(await actionItemsAPI.list({ meetingId }))
    } catch (err) { setError(err.message) }
    setSaving(false)
  }

  const updateStatus = async (id, status) => {
    const action = actions.find(a => a.id === id)
    if (action?.is_tracked && status === 'closed' && action.status !== 'closed') {
      setTrackedWarning(action)
      return
    }
    try {
      await actionItemsAPI.update(id, { status })
      setActions(a => a.map(x => x.id === id ? { ...x, status } : x))
    } catch (err) { console.warn('[MeetingDetail.loadMeeting]', err) }
  }

  const deleteAction = async (id) => {
    try { await actionItemsAPI.delete(id); setActions(a => a.filter(x => x.id !== id)) } catch (err) { console.warn('[MeetingDetail.loadActions]', err) }
    setConfirm(null)
  }

  const bulkDelete = async () => {
    try { await actionItemsAPI.bulkDelete(selectedActions); setActions(a => a.filter(x => !selectedActions.includes(x.id))); setSelectedActions([]) } catch (err) { console.warn('[MeetingDetail.updateStatus]', err) }
    setConfirm(null)
  }

  // Add to Tracker
  const openAddToTracker = (action) => {
    setTrackerAction(action)
    setTrackerForm({ classification: 'issue', raisedDate: format(new Date(), 'yyyy-MM-dd'), remarks: '' })
    setShowTrackerModal(true)
  }

  const saveToTracker = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const item = await trackerAPI.create({
        projectId: meeting.project_id,
        clientId: meeting.client_id,
        actionItemId: trackerAction.id,
        description: trackerAction.title,
        classification: trackerForm.classification,
        raisedDate: trackerForm.raisedDate,
        remarks: trackerForm.remarks,
        raisedBy: trackerAction.assigned_to_name || '',
      })
      await actionItemsAPI.addToTracker(trackerAction.id, item.id)
      setActions(a => a.map(x => x.id === trackerAction.id ? { ...x, is_tracked: true, tracker_item_id: item.id } : x))
      setShowTrackerModal(false)
    } catch (err) { toast.error(err.message) }
    setSaving(false)
  }

  // AI: generate summary from raw notes (opens notes input modal)
  const handleGenerateSummary = async () => {
    if (!aiNotes.trim()) return
    setAiLoading(true)
    try {
      const res = await aiAPI.meetingSummary({
        title: meeting.title, date: meeting.date, attendees: meeting.attendees,
        venue: meeting.venue, duration: meeting.duration, objective: meeting.objective,
        discussionPoints: aiNotes
      })
      await meetingsAPI.update(meeting.id, { ...meeting, discussionPoints: aiNotes, aiSummary: res.summary })
      setMeeting(m => ({ ...m, discussion_points: aiNotes, ai_summary: res.summary }))
      setShowAiModal(false)
      setAiNotes('')
    } catch (err) { toast.error(err.message) }
    setAiLoading(false)
  }

  // AI: extract action items from the existing saved summary — directly create with title only
  const handleExtractFromSummary = async () => {
    if (!meeting?.ai_summary) return
    setAiLoading(true)
    try {
      const res = await aiAPI.extractFromSummary({ summary: meeting.ai_summary, attendees: meeting?.attendees })
      for (const item of res.items) {
        if (item.title?.trim()) {
          await actionItemsAPI.create({
            meetingId: meeting.id,
            projectId: meeting.project_id,
            clientId: meeting.client_id,
            title: item.title,
            assignedTo: null,
            assignedToName: '',
            dueDate: null
          })
        }
      }
      const actionParams = { meetingId }
      setActions(await actionItemsAPI.list(actionParams))
    } catch (err) { toast.error(err.message) }
    setAiLoading(false)
  }

  // PDF Export
  const exportPDF = () => {
    // Replace Unicode chars that WinAnsi Helvetica can't render (else jsPDF outputs one letter per line).
    const sanitize = (t) => {
      if (t == null) return ''
      return String(t)
        .replace(/\r\n/g, '\n')
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[“”„‟]/g, '"')
        .replace(/[–—−]/g, '-')
        .replace(/…/g, '...')
        .replace(/[•●▪▫◦‣⁃]/g, '- ')
        .replace(/ /g, ' ')
        .replace(/[^\x00-\x7F]/g, '')
    }

    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const marginX = 14
    const contentW = pageW - marginX * 2
    const bottomLimit = pageH - 18
    let y = 0

    const ensureSpace = (needed) => {
      if (y + needed > bottomLimit) {
        doc.addPage()
        y = 18
      }
    }

    const drawHeaderBanner = () => {
      doc.setFillColor(37, 99, 235)
      doc.rect(0, 0, pageW, 26, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
      doc.text('Minutes of Meeting', marginX, 12)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      doc.text(`Generated: ${format(new Date(), 'PPP')}`, marginX, 19)
      y = 34
    }

    const writeMetaRow = (label, value) => {
      ensureSpace(6)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(90)
      doc.text(label, marginX, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30)
      const lines = doc.splitTextToSize(sanitize(value) || '-', contentW - 32)
      doc.text(lines, marginX + 32, y)
      y += Math.max(5, lines.length * 4.5) + 1
    }

    const writeSection = (title, body) => {
      const clean = sanitize(body).trim()
      if (!clean) return
      ensureSpace(14)
      // Section header bar
      doc.setFillColor(240, 244, 251)
      doc.rect(marginX, y - 4, contentW, 7, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(37, 99, 235)
      doc.text(title.toUpperCase(), marginX + 2, y + 1)
      y += 7

      // Render line-by-line so blank lines and inline headers are preserved.
      // ALL CAPS lines (e.g. "EXECUTIVE SUMMARY", "KEY DISCUSSIONS", "KEY DECISIONS")
      // are rendered bold + black to stand out inside the AI Summary.
      const isInlineHeader = (s) =>
        s.length > 2 && s.length <= 60 && s === s.toUpperCase() && /[A-Z]/.test(s) && !/^\d+\./.test(s)

      const paragraphs = clean.split('\n')
      for (const raw of paragraphs) {
        const line = raw.trim()
        if (!line) { y += 3; continue }
        if (isInlineHeader(line)) {
          ensureSpace(8)
          doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0)
          doc.text(line, marginX, y + 2)
          y += 7
          continue
        }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(45)
        const wrapped = doc.splitTextToSize(line, contentW)
        for (const w of wrapped) {
          ensureSpace(5)
          doc.text(w, marginX, y)
          y += 5
        }
      }
      y += 4
    }

    // === Build the document ===
    drawHeaderBanner()

    // Title of the meeting
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20)
    const titleLines = doc.splitTextToSize(sanitize(meeting.title), contentW)
    doc.text(titleLines, marginX, y)
    y += titleLines.length * 6 + 3

    // Underline separator
    doc.setDrawColor(220); doc.setLineWidth(0.3)
    doc.line(marginX, y, pageW - marginX, y)
    y += 6

    // Meta rows
    writeMetaRow('Client:', meeting.client_name)
    writeMetaRow('Project:', meeting.project_name)
    writeMetaRow('Date:', format(parseISO(meeting.date), 'MMMM d, yyyy'))
    writeMetaRow('Venue:', meeting.venue)
    writeMetaRow('Duration:', meeting.duration)
    writeMetaRow('Attendees:', meeting.attendees)
    y += 4

    // Body sections
    writeSection('Objective', meeting.objective)
    if (meeting.ai_summary) writeSection('AI Summary', meeting.ai_summary)

    // Action Items always start on a new page (page 2+)
    doc.addPage()
    y = 18
    doc.setFillColor(240, 244, 251)
    doc.rect(marginX, y - 4, contentW, 7, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(37, 99, 235)
    doc.text('ACTION ITEMS', marginX + 2, y + 1)
    y += 9

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Status', 'Action Item', 'Assigned To', 'Due Date']],
      body: actions.length
        ? actions.map(a => [
            sanitize(a.status),
            sanitize(a.title),
            sanitize(a.assigned_to_name) || '-',
            a.due_date ? format(parseISO(a.due_date), 'MMM d, yyyy') : '-'
          ])
        : [['-', 'No action items recorded', '-', '-']],
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak', valign: 'top' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 24 },
        2: { cellWidth: 38 },
        3: { cellWidth: 28 },
      },
    })

    // Footer page numbers
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140)
      doc.text(`Page ${i} of ${pageCount}`, pageW - marginX, pageH - 8, { align: 'right' })
    }

    const clientSlug = (meeting.client_name || 'client').toLowerCase().replace(/\s+/g, '')
    const dateStr = format(parseISO(meeting.date), 'dd-MM-yyyy')
    doc.save(`${clientSlug}_MoM_${dateStr}.pdf`)
  }

  const setAF = (k) => (e) => setActionForm(f => ({ ...f, [k]: e.target.value }))

  const getEffectiveStatus = (a) => {
    if (a.status === 'closed') return 'closed'
    if (a.due_date && isPast(new Date(a.due_date + 'T23:59:59')) && a.status !== 'closed') return 'delayed'
    return a.status
  }

  if (loading) return <Spinner large center />
  if (!meeting) return null

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <button className="flex items-center gap-1 text-sm" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginBottom: '0.75rem' }} onClick={() => navigate('/meetings')}>
          <ChevronLeft size={16} />Back to Meetings
        </button>
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ marginBottom: '0.25rem' }}>{meeting.title}</h1>
            <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
              <span className="text-sm text-muted">{format(parseISO(meeting.date), 'EEEE, MMMM d, yyyy')}</span>
              <span className="text-sm text-muted">·</span>
              <span className="text-sm text-muted">{meeting.client_name} / {meeting.project_name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            {isPM && (
              <button className="btn btn-outline btn-sm" onClick={() => { setAiNotes(''); setShowAiModal(true) }} disabled={aiLoading}>
                <Sparkles size={14} />{aiLoading ? 'Processing...' : 'Generate Summary'}
              </button>
            )}
            <button className="btn btn-outline btn-sm" onClick={exportPDF}><Download size={14} />PDF</button>
          </div>
        </div>
      </div>

      {/* Meeting Info */}
      <div className="card mb-4" style={{ background: 'var(--primary-soft)', border: '1px solid rgba(37,99,235,0.15)' }}>
        <div className="grid-3" style={{ gap: '1.25rem', marginBottom: '1rem' }}>
          <div><div className="label mb-1">Attendees</div><div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>{meeting.attendees || '—'}</div></div>
          <div><div className="label mb-1">Venue / Duration</div><div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>{[meeting.venue, meeting.duration].filter(Boolean).join(' · ') || '—'}</div></div>
          <div><div className="label mb-1">Objective</div><div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>{meeting.objective || '—'}</div></div>
        </div>
        {meeting.ai_summary && (
          <div style={{ marginTop: '1rem', padding: '0.875rem', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3"><Sparkles size={14} style={{ color: 'var(--primary)' }} /><span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--primary)' }}>AI Summary</span></div>
            <div style={{ fontSize: '0.875rem', lineHeight: 1.75, color: 'var(--text-main)' }}>
              {meeting.ai_summary.split('\n').map((line, i) => {
                const trimmed = line.trim()
                if (!trimmed) return <div key={i} style={{ height: '0.5rem' }} />
                // ALL CAPS lines are section headers
                if (trimmed === trimmed.toUpperCase() && trimmed.length > 2 && !/^\d+\./.test(trimmed)) {
                  return <div key={i} style={{ fontWeight: 700, fontSize: '0.8125rem', letterSpacing: '0.04em', color: 'var(--primary)', marginTop: i === 0 ? 0 : '1rem', marginBottom: '0.35rem' }}>{trimmed}</div>
                }
                // Numbered list lines
                if (/^\d+\./.test(trimmed)) {
                  return <div key={i} style={{ paddingLeft: '0.25rem', marginBottom: '0.25rem' }}>{trimmed}</div>
                }
                return <div key={i} style={{ marginBottom: '0.25rem' }}>{trimmed}</div>
              })}
            </div>
          </div>
        )}
      </div>

      {/* Action Items */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3>Action Items <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>({actions.length})</span></h3>
          <div className="flex items-center gap-2">
            {selectedActions.length > 0 && isPM && (
              <button className="btn btn-danger-outline btn-sm" onClick={() => setConfirm({ bulk: true })}><Trash2 size={13} />Delete ({selectedActions.length})</button>
            )}
            {isPM && meeting?.ai_summary && (
              <button className="btn btn-outline btn-sm" onClick={handleExtractFromSummary} disabled={aiLoading}>
                <FileText size={14} />{aiLoading ? 'Extracting...' : 'Extract Action Items'}
              </button>
            )}
            {isPM && <button className="btn btn-primary btn-sm" onClick={openAddAction}><Plus size={14} />Add Action</button>}
          </div>
        </div>

        {actions.length === 0 ? (
          <EmptyState icon={CheckSquare} title="No action items yet"
            action={isPM ? <button className="btn btn-primary btn-sm" onClick={openAddAction}><Plus size={14} />Add Action</button> : null} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {isPM && <th className="th-checkbox"><input type="checkbox" checked={selectedActions.length === actions.length && actions.length > 0} onChange={e => setSelectedActions(e.target.checked ? actions.map(a => a.id) : [])} /></th>}
                  <th style={{ width: 50 }}>S No</th>
                  <th>Status</th><th>Action Item</th><th>Assigned To</th><th>Due Date</th><th>Tracker</th>
                  {isPM && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {actions.map((a, idx) => {
                  const effStatus = getEffectiveStatus(a)
                  return (
                    <tr key={a.id}>
                      {isPM && <td className="td-checkbox"><input type="checkbox" checked={selectedActions.includes(a.id)} onChange={e => setSelectedActions(s => e.target.checked ? [...s, a.id] : s.filter(x => x !== a.id))} /></td>}
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center' }}>{idx + 1}</td>
                      <td>
                        <select value={a.status} onChange={e => updateStatus(a.id, e.target.value)}
                          className={`badge badge-${effStatus}`}
                          style={{ border: 'none', outline: 'none', cursor: 'pointer', background: 'transparent' }}>
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="closed">Closed</option>
                        </select>
                        {effStatus === 'delayed' && <span className="badge badge-delayed" style={{ marginLeft: 4 }}>Delayed</span>}
                      </td>
                      <td style={{ fontWeight: 500, maxWidth: 360, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        {a.title}
                      </td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{a.assigned_to_name || '—'}</td>
                      <td style={{ fontSize: '0.875rem', color: a.due_date && isPast(new Date(a.due_date + 'T23:59:59')) && a.status !== 'closed' ? 'var(--error)' : 'var(--text-muted)' }}>
                        {a.due_date ? format(parseISO(a.due_date), 'MMM d, yyyy') : '—'}
                      </td>
                      <td>
                        {a.is_tracked
                          ? <span className="tracked-badge"><Link2 size={10} />Tracked</span>
                          : isPM && <button className="btn btn-outline btn-sm" onClick={() => openAddToTracker(a)} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}><Link2 size={11} />Add to Tracker</button>
                        }
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex items-center gap-1" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn-ghost" onClick={() => openEditAction(a)}><Edit2 size={14} /></button>
                          {isSuperAdmin && <button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => setConfirm({ id: a.id, title: a.title })}><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {showActionModal && (
        <Modal title={editAction ? 'Edit Action Item' : 'New Action Item'} onClose={() => setShowActionModal(false)} maxWidth="500px"
          footer={<><button className="btn btn-outline" onClick={() => setShowActionModal(false)}>Cancel</button><button className="btn btn-primary" onClick={saveAction} disabled={saving}>{saving ? <span className="spinner" /> : editAction ? 'Save' : 'Create'}</button></>}>
          {error && <div className="alert alert-error mb-4">{error}</div>}
          <form onSubmit={saveAction} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div className="form-group"><label className="label">What needs to be done? *</label><textarea className="textarea" style={{ minHeight: 80 }} value={actionForm.title} onChange={setAF('title')} required autoFocus /></div>
            <div className="grid-2">
              <div className="form-group">
                <label className="label">Assigned To</label>
                <select className="input" value={actionForm.assignedTo} onChange={e => {
                  const u = users.find(x => x.id === e.target.value)
                  setActionForm(f => ({ ...f, assignedTo: e.target.value, assignedToName: u?.full_name || '' }))
                }}>
                  <option value="">Select member</option>
                  {users.filter(u => u.role !== 'super_admin').map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="label">Due Date</label><input type="date" className="input" value={actionForm.dueDate} onChange={setAF('dueDate')} /></div>
            </div>
          </form>
        </Modal>
      )}

      {/* Add to Tracker Modal */}
      {showTrackerModal && (
        <Modal title="Add to Task Tracker" onClose={() => setShowTrackerModal(false)} maxWidth="460px"
          footer={<><button className="btn btn-outline" onClick={() => setShowTrackerModal(false)}>Cancel</button><button className="btn btn-primary" onClick={saveToTracker} disabled={saving}>{saving ? <span className="spinner" /> : 'Add to Tracker'}</button></>}>
          <div style={{ padding: '0.75rem', background: 'var(--bg-sidebar)', borderRadius: 'var(--radius)', marginBottom: '1rem', fontSize: '0.875rem' }}>
            <span style={{ fontWeight: 600 }}>Action:</span> {trackerAction?.title}
          </div>
          <form onSubmit={saveToTracker} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div className="form-group">
              <label className="label">Classification</label>
              <select className="input" value={trackerForm.classification} onChange={e => setTrackerForm(f => ({ ...f, classification: e.target.value }))}>
                <option value="issue">Issue</option>
                <option value="new_requirement">New Requirement</option>
                <option value="change_request">Change Request</option>
                <option value="tbd">TBD</option>
              </select>
            </div>
            <div className="form-group"><label className="label">Raised Date</label><input type="date" className="input" value={trackerForm.raisedDate} onChange={e => setTrackerForm(f => ({ ...f, raisedDate: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Remarks</label><textarea className="textarea" style={{ minHeight: 72 }} value={trackerForm.remarks} onChange={e => setTrackerForm(f => ({ ...f, remarks: e.target.value }))} /></div>
          </form>
        </Modal>
      )}

      {/* AI Summary Modal — paste raw notes to generate summary */}
      {showAiModal && (
        <Modal title="Generate Meeting Summary" onClose={() => { setShowAiModal(false); setAiNotes('') }} maxWidth="580px"
          footer={<>
            <button className="btn btn-outline" onClick={() => { setShowAiModal(false); setAiNotes('') }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleGenerateSummary} disabled={aiLoading || !aiNotes.trim()}>
              {aiLoading ? <><span className="spinner" />Generating...</> : <><Sparkles size={14} />Generate Summary</>}
            </button>
          </>}>
          <p className="mb-4" style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Paste your rough meeting notes below. AI will generate a professional summary and save it to this meeting.</p>
          <div className="form-group">
            <label className="label">Meeting Notes</label>
            <textarea className="textarea" style={{ minHeight: 180 }} placeholder="Paste your raw meeting notes here..." value={aiNotes} onChange={e => setAiNotes(e.target.value)} autoFocus />
          </div>
        </Modal>
      )}

      {/* Tracked warning */}
      {trackedWarning && (
        <Modal title="Action Linked to Tracker" onClose={() => setTrackedWarning(null)} maxWidth="420px"
          footer={<button className="btn btn-primary" onClick={() => setTrackedWarning(null)}>Got it</button>}>
          <div className="flex gap-3 items-center">
            <AlertCircle size={22} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            <p style={{ color: 'var(--text-main)' }}>This action item is linked to a Tracker item. Please update the Tracker status to keep both records synchronized.</p>
          </div>
        </Modal>
      )}

      {confirm && !confirm.bulk && (
        <ConfirmDialog title="Delete Action Item" message={`Delete "${confirm.title}"?`} onConfirm={() => deleteAction(confirm.id)} onCancel={() => setConfirm(null)} />
      )}
      {confirm?.bulk && (
        <ConfirmDialog title="Delete Action Items" message={`Delete ${selectedActions.length} item(s)?`} onConfirm={bulkDelete} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
