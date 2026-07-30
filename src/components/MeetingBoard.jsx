import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
    Plus, Trash2, CheckCircle, Clock, Circle, Calendar,
    User, ChevronRight, LogOut, Loader2, Edit3,
    MapPin, Target, MessageSquare, Timer, CheckSquare, Square,
    Settings as SettingsIcon, Save, X, Search, UserPlus,
    Download, FileText, Paperclip, Image as ImageIcon,
    Share2, MoreVertical, Filter, ChevronDown, List, ChevronLeft,
    Home
} from 'lucide-react'
import { format } from 'date-fns'
import ShareModal from './ShareModal'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export default function MeetingBoard({ session, onOpenSettings }) {
    const [view, setView] = useState('home') // 'home', 'meetings', or 'tracker'
    const [userData, setUserData] = useState(null)
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light')
    const [loading, setLoading] = useState(true)

    const isAdmin = userData?.role?.toLowerCase() === 'admin'
    const roleLabel = userData ? (isAdmin ? 'Admin' : 'User') : '...'

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('theme', theme)
    }, [theme])

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light')

    const getBadgeClass = (status) => {
        if (view === 'tracker') {
            return status === 'completed' ? 'badge-closed' : 'badge-open'
        }
        switch (status) {
            case 'Open': return 'badge-open'
            case 'In Progress': return 'badge-progress'
            case 'Closed': return 'badge-closed'
            case 'Delayed': return 'badge-delayed'
            default: return 'badge-progress'
        }
    }

    const calculateEffectiveStatus = (status, dueDate) => {
        if (status === 'Closed') return 'Closed'
        if (!dueDate) return status
        const today = new Date().setHours(0, 0, 0, 0)
        const due = new Date(dueDate).setHours(0, 0, 0, 0)
        if (due < today) return 'Delayed'
        return status
    }

    const renderValue = (val) => val && val.toString().trim() !== '' ? val : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>Nil</span>

    const safeFormat = (dateStr, formatStr) => {
        if (!dateStr) return '-'
        try {
            const date = new Date(dateStr)
            if (isNaN(date.getTime())) return '-'
            return format(date, formatStr)
        } catch (e) {
            return '-'
        }
    }

    const [meetings, setMeetings] = useState([])
    const [selectedMeeting, setSelectedMeeting] = useState(null)
    const [actionItems, setActionItems] = useState([])
    const [userRole, setUserRole] = useState('Owner') // Owner, Editor, Viewer

    const [clients, setClients] = useState([])
    const [selectedClient, setSelectedClient] = useState(null)
    const [trackerItems, setTrackerItems] = useState([])

    // Modals & Search
    const [showAddMeeting, setShowAddMeeting] = useState(false)
    const [showAddAction, setShowAddAction] = useState(false)
    const [showAddClient, setShowAddClient] = useState(false)
    const [showAddTrackerItem, setShowAddTrackerItem] = useState(false)
    const [showShare, setShowShare] = useState(false)
    const [editMeeting, setEditMeeting] = useState(null)
    const [editAction, setEditAction] = useState(null)
    const [editClient, setEditClient] = useState(null)
    const [editTrackerItem, setEditTrackerItem] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')

    const clearFilters = () => {
        setFromDate('')
        setToDate('')
        setSearchQuery('')
    }

    const [selectedWorkLog, setSelectedWorkLog] = useState(null)
    const [workLogs, setWorkLogs] = useState([])
    const [showAddWorkLog, setShowAddWorkLog] = useState(false)
    const [editWorkLog, setEditWorkLog] = useState(null)
    const [workLogForm, setWorkLogForm] = useState({ name: '', date: format(new Date(), 'yyyy-MM-dd') })

    const [attachments, setAttachments] = useState([])
    const [uploading, setUploading] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(true)

    // Selection
    const [selectedActionItems, setSelectedActionItems] = useState([])
    const [selectedTrackerItems, setSelectedTrackerItems] = useState([])
    const [selectedClients, setSelectedClients] = useState([])
    const [selectedMeetings, setSelectedMeetings] = useState([])
    const [selectedWorkLogs, setSelectedWorkLogs] = useState([])

    // Form states
    const [meetingForm, setMeetingForm] = useState({
        title: '', date: format(new Date(), 'yyyy-MM-dd'),
        attendees: '', venue: '', duration: '', venue_duration: '', objective: '', discussion_points: ''
    })
    const [clientForm, setClientForm] = useState({ name: '' })
    const [trackerForm, setTrackerForm] = useState({
        description: '', classification: 'issue', status: 'pending',
        raised_date: format(new Date(), 'yyyy-MM-dd'), dev_start_date: '',
        deployed_date: '', client_remarks: '', spr_remarks: ''
    })
    const [actionForm, setActionForm] = useState({ title: '', owner: '', due_date: '' })

    useEffect(() => {
        fetchUserData()
        fetchMeetings()
    }, [])

    const fetchUserData = async () => {
        try {
            const userId = session.user.id
            const email = session.user.email
            const fullName = session.user.user_metadata?.full_name || ''
            const isPrimaryAdmin = email === 'akshita.kancharla@sprconsultech.com'

            // Try to fetch existing profile
            const { data, error } = await supabase.from('users').select('*').eq('id', userId).single()

            if (data) {
                console.log('User data found:', data)
                // Self-healing for primary admin
                if (isPrimaryAdmin && data.role !== 'admin') {
                    console.log('Syncing primary admin role...')
                    await supabase.from('users').update({ role: 'admin' }).eq('id', userId)
                    setUserData({ ...data, role: 'admin' })
                } else if (!isPrimaryAdmin && data.role === 'admin') {
                    // Force downgrade if they were wrongly set as admin
                    console.log('Downgrading non-primary admin...')
                    await supabase.from('users').update({ role: 'user' }).eq('id', userId)
                    setUserData({ ...data, role: 'user' })
                } else {
                    setUserData(data)
                }
            } else {
                // If no record, create one. Only primary email gets admin.
                const role = isPrimaryAdmin ? 'admin' : 'user'
                console.log(`No user record found, creating as ${role}...`)
                const { data: newData, error: insertError } = await supabase
                    .from('users')
                    .upsert({ id: userId, email: email.toLowerCase().trim(), full_name: fullName, role: role })
                    .select()
                    .single()

                if (!insertError && newData) {
                    setUserData(newData)
                } else {
                    setUserData({ id: userId, role: role, full_name: fullName }) // Fallback in memory
                }
            }
        } catch (err) {
            console.error('Unexpected error in fetchUserData:', err)
            const isPrimaryAdmin = session.user.email === 'akshita.kancharla@sprconsultech.com'
            setUserData({ role: isPrimaryAdmin ? 'admin' : 'user', full_name: session.user.user_metadata?.full_name || 'User' })
        }
    }

    // Sync Meeting Form when editing
    useEffect(() => {
        if (editMeeting) {
            setMeetingForm({
                title: editMeeting.title,
                date: editMeeting.date,
                attendees: editMeeting.attendees || '',
                venue: editMeeting.venue || '',
                duration: editMeeting.duration || '',
                venue_duration: [editMeeting.duration, editMeeting.venue].filter(Boolean).join(', '),
                objective: editMeeting.objective || '',
                discussion_points: editMeeting.discussion_points || ''
            })
        } else {
            setMeetingForm({
                title: '', date: format(new Date(), 'yyyy-MM-dd'),
                attendees: '', venue: '', duration: '', venue_duration: '', objective: '', discussion_points: ''
            })
        }
    }, [editMeeting])

    // Sync Action Form when editing
    useEffect(() => {
        if (editAction) {
            setActionForm({
                title: editAction.title,
                owner: editAction.owner,
                due_date: editAction.due_date || ''
            })
        } else {
            setActionForm({ title: '', owner: '', due_date: '' })
        }
    }, [editAction])

    useEffect(() => {
        if (selectedMeeting) {
            checkUserRole(selectedMeeting)
            fetchActionItems(selectedMeeting.id)
            fetchAttachments(selectedMeeting.id)
        }
    }, [selectedMeeting])

    const fetchMeetings = async () => {
        setLoading(true)
        const email = session.user.email?.toLowerCase().trim()

        let allMeetings = []
        if (isAdmin) {
            const { data } = await supabase.from('meetings').select('*')
            allMeetings = data || []
        } else {
            const { data: owned } = await supabase.from('meetings').select('*').eq('user_id', session.user.id)
            const { data: shared } = await supabase.from('meeting_shares').select('meetings(*)').eq('user_email', email)
            const sharedFormatted = shared ? shared.map(s => s.meetings).filter(Boolean) : []
            allMeetings = [...(owned || []), ...sharedFormatted]
        }

        const uniqueMeetings = Array.from(new Map(allMeetings.map(m => [m.id, m])).values())
        uniqueMeetings.sort((a, b) => new Date(b.date) - new Date(a.date))
        setMeetings(uniqueMeetings)
        setLoading(false)
    }

    const checkUserRole = async (meeting) => {
        if (!meeting) return
        if (isAdmin || meeting.user_id === session?.user?.id) {
            setUserRole('Owner')
            return
        }
        const email = session?.user?.email?.toLowerCase().trim()
        const { data } = await supabase.from('meeting_shares').select('role').eq('meeting_id', meeting.id).eq('user_email', email).single()
        if (data) setUserRole(data.role)
        else setUserRole('Viewer')
    }

    const checkClientRole = async (client) => {
        if (!client) return
        if (isAdmin || client.user_id === session?.user?.id) {
            setUserRole('Owner')
            return
        }
        const email = session?.user?.email?.toLowerCase().trim()
        const { data } = await supabase.from('client_shares').select('role').eq('client_id', client.id).eq('user_email', email).single()
        if (data) setUserRole(data.role)
        else setUserRole('Viewer')
    }

    const fetchActionItems = async (meetingId) => {
        const { data } = await supabase.from('action_items').select('*').eq('meeting_id', meetingId).order('created_at', { ascending: true })
        if (data) setActionItems(data)
    }

    const fetchClients = async () => {
        const email = session.user.email?.toLowerCase().trim()
        let allClients = []

        if (isAdmin) {
            const { data } = await supabase.from('clients').select('*')
            allClients = data || []
        } else {
            // Fetch owned clients
            const { data: owned } = await supabase.from('clients').select('*').eq('user_id', session.user.id)

            // Fetch shared clients
            const { data: shared } = await supabase.from('client_shares').select('clients(*)').eq('user_email', email)
            const sharedFormatted = shared ? shared.map(s => s.clients).filter(Boolean) : []

            // Fetch clients of shared meetings
            const { data: sharedM } = await supabase.from('meeting_shares').select('meetings(clients(*))').eq('user_email', email)
            const sharedMFormatted = sharedM ? sharedM.map(s => s.meetings?.clients).filter(Boolean) : []

            allClients = [...(owned || []), ...sharedFormatted, ...sharedMFormatted]
        }

        const uniqueClients = Array.from(new Map(allClients.map(c => [c.id, c])).values())
        uniqueClients.sort((a, b) => a.name.localeCompare(b.name))

        setClients(uniqueClients)
    }

    const fetchTrackerItems = async (workLogId) => {
        const { data } = await supabase.from('client_tracker_items').select('*').eq('work_log_id', workLogId).order('raised_date', { ascending: false })
        if (data) setTrackerItems(data)
    }

    const fetchWorkLogs = async (clientId) => {
        console.log('Fetching work logs for client:', clientId)
        const { data, error } = await supabase.from('work_logs').select('*').eq('client_id', clientId).order('date', { ascending: false })
        if (error) console.error('Fetch work logs error:', error)
        if (data) setWorkLogs(data)
    }

    const fetchClientMeetings = async (clientId) => {
        console.log('Fetching client meetings:', clientId, 'isAdmin:', isAdmin)
        // If admin, show all for this client
        if (isAdmin) {
            const { data } = await supabase.from('meetings').select('*').eq('client_id', clientId).order('date', { ascending: false })
            if (data) setMeetings(data)
            return
        }

        const email = session?.user?.email?.toLowerCase().trim()

        // Check if client is shared with user
        const { data: clientShare } = await supabase.from('client_shares').select('role').eq('client_id', clientId).eq('user_email', email).maybeSingle()

        if (clientShare) {
            // If client is shared, user can see all meetings for this client
            const { data } = await supabase.from('meetings').select('*').eq('client_id', clientId).order('date', { ascending: false })
            if (data) setMeetings(data)
            return
        }

        // If not shared at client level, show owned + individually shared meetings
        const { data: owned } = await supabase.from('meetings').select('*').eq('client_id', clientId).eq('user_id', session.user.id)
        const { data: shared } = await supabase.from('meeting_shares').select('meetings(*)').eq('user_email', email)

        const sharedFiltered = shared
            ? shared.map(s => s.meetings).filter(m => m && m.client_id === clientId)
            : []

        const allMeetings = [...(owned || []), ...sharedFiltered]
        const uniqueMeetings = Array.from(new Map(allMeetings.map(m => [m.id, m])).values())
        uniqueMeetings.sort((a, b) => new Date(b.date) - new Date(a.date))
        setMeetings(uniqueMeetings)
    }

    useEffect(() => {
        fetchClients()
        if (view === 'tracker') setSidebarOpen(false)
        else setSidebarOpen(true)
    }, [view])

    useEffect(() => {
        if (selectedClient && view === 'tracker') fetchWorkLogs(selectedClient.id)
    }, [selectedClient])

    useEffect(() => {
        if (selectedWorkLog) fetchTrackerItems(selectedWorkLog.id)
    }, [selectedWorkLog])

    const fetchAttachments = async (meetingId) => {
        const { data } = await supabase.from('meeting_attachments').select('*').eq('meeting_id', meetingId)
        if (data) {
            const withSignedUrls = await Promise.all(data.map(async (att) => {
                const { data: urlData } = await supabase.storage.from('meeting-attachments').createSignedUrl(att.file_path, 3600)
                return { ...att, signedUrl: urlData?.signedUrl }
            }))
            setAttachments(withSignedUrls)
        }
    }

    const handleFileUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        setUploading(true)
        const filePath = `${selectedMeeting.id}/${Date.now()}_${file.name}`
        const { error: uploadError } = await supabase.storage.from('meeting-attachments').upload(filePath, file)
        if (uploadError) alert(uploadError.message)
        else {
            const { error: dbError } = await supabase.from('meeting_attachments').insert([{ meeting_id: selectedMeeting.id, file_path: filePath, file_name: file.name, file_type: file.type }])
            if (dbError) alert(dbError.message)
            else fetchAttachments(selectedMeeting.id)
        }
        setUploading(false)
    }

    const deleteAttachment = async (att) => {
        if (!confirm(`Delete ${att.file_name}?`)) return
        await supabase.storage.from('meeting-attachments').remove([att.file_path])
        await supabase.from('meeting_attachments').delete().eq('id', att.id)
        fetchAttachments(selectedMeeting.id)
    }

    const renameAttachment = async (att) => {
        const newName = prompt('Enter new filename:', att.file_name)
        if (!newName || newName === att.file_name) return
        await supabase.from('meeting_attachments').update({ file_name: newName }).eq('id', att.id)
        fetchAttachments(selectedMeeting.id)
    }

    const handleCreateOrUpdateMeeting = async (e) => {
        e.preventDefault()
        const { venue_duration, ...cleanForm } = meetingForm
        const payload = {
            ...cleanForm,
            duration: cleanForm.duration.trim(),
            venue: cleanForm.venue.trim(),
            user_id: session.user.id,
            ...(selectedClient?.id && { client_id: selectedClient.id })
        }
        if (editMeeting) {
            const { data, error } = await supabase.from('meetings').update(payload).eq('id', editMeeting.id).select()
            if (error) return alert(error.message)
            if (data) {
                setMeetings(meetings.map(m => m.id === editMeeting.id ? data[0] : m))
                setSelectedMeeting(data[0])
                setEditMeeting(null)
            }
        } else {
            const { data, error } = await supabase.from('meetings').insert([payload]).select()
            if (error) return alert(error.message)
            if (data) {
                setMeetings([data[0], ...meetings])
                setSelectedMeeting(data[0])
                setShowAddMeeting(false)
                setMeetingForm({
                    title: '', date: format(new Date(), 'yyyy-MM-dd'),
                    attendees: '', venue: '', duration: '', venue_duration: '', objective: '', discussion_points: ''
                })
            }
        }
    }

    const deleteMeeting = async (id) => {
        if (!confirm('Are you sure? All action items and attachments will be deleted.')) return
        await supabase.from('meetings').delete().eq('id', id)
        setMeetings(meetings.filter(m => m.id !== id))
        setSelectedMeeting(null)
    }

    const handleCreateOrUpdateAction = async (e) => {
        e.preventDefault()
        const payload = { ...actionForm, meeting_id: selectedMeeting.id }
        if (editAction) {
            const { data } = await supabase.from('action_items').update(payload).eq('id', editAction.id).select()
            if (data) {
                setActionItems(actionItems.map(item => item.id === editAction.id ? data[0] : item))
                setEditAction(null)
                setActionForm({ title: '', owner: '', due_date: '' })
            }
        } else {
            const { data } = await supabase.from('action_items').insert([payload]).select()
            if (data) {
                setActionItems([...actionItems, data[0]])
                setShowAddAction(false)
                setActionForm({ title: '', owner: '', due_date: '' })
            }
        }
    }

    const updateActionStatus = async (id, status) => {
        await supabase.from('action_items').update({ status }).eq('id', id)
        setActionItems(actionItems.map(item => item.id === id ? { ...item, status } : item))
    }

    const deleteActionItem = async (id) => {
        await supabase.from('action_items').delete().eq('id', id)
        setActionItems(actionItems.filter(item => item.id !== id))
    }






    const getFormattedDateRange = () => {
        if (!fromDate && !toDate) return format(new Date(), "do MMM''yy")
        const start = fromDate ? format(new Date(fromDate), "do MMM''yy") : 'Start'
        const end = toDate ? format(new Date(toDate), "do MMM''yy") : 'End'
        return `${start} to ${end}`
    }

    const exportExcel = () => {
        const dateRangeStr = getFormattedDateRange()
        const clientName = view === 'meetings' ? selectedMeeting?.title : (selectedWorkLog ? `${selectedClient?.name}_${selectedWorkLog.name}` : selectedClient?.name)
        const data = view === 'meetings' ? filteredActionItems : filteredTrackerItems
        const title = `${clientName} Update as of ${dateRangeStr}`
        const fileName = `${clientName}_${dateRangeStr}.xls`
        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
                <style>
                    .title { font-weight: bold; font-size: 14pt; height: 40px; vertical-align: middle; text-align: center; }
                    .header { font-weight: bold; background-color: #E5E7EB; border: 0.5pt solid #000000; }
                    .cell { border: 0.5pt solid #D1D5DB; }
                    .pending { background-color: #FEF2F2; color: #991B1B; font-weight: bold; }
                    .completed { background-color: #F0FDF4; color: #166534; font-weight: bold; }
                    td { padding: 5px; }
                </style>
            </head>
            <body>
                <table>
                    <tr><td colspan="8" class="title">${title}</td></tr>
                    <tr></tr>
                    <tr class="header">
                        ${view === 'meetings' ?
                `<td>Action Item</td><td>Assigned to</td><td>Status</td><td>Due Date</td>` :
                `<td>Description</td><td>Classification</td><td>Status</td><td>Raised Concern on</td><td>Dev Start Date</td><td>Deployed on</td><td>Client Remarks</td><td>SPR Remarks</td>`
            }
                    </tr>
        `
        data.forEach(item => {
            html += `<tr>${view === 'meetings' ?
                `<td class="cell">${item.title}</td><td class="cell">${item.owner}</td><td class="cell">${calculateEffectiveStatus(item.status, item.due_date)}</td><td class="cell">${item.due_date || '-'}</td>` :
                `<td class="cell">${item.description || 'Nil'}</td><td class="cell">${item.classification || 'Nil'}</td><td class="cell ${item.status === 'completed' ? 'completed' : 'pending'}">${item.status || 'Nil'}</td><td class="cell">${item.raised_date ? format(new Date(item.raised_date), 'dd-MM-yyyy') : 'Nil'}</td><td class="cell">${item.dev_start_date ? format(new Date(item.dev_start_date), 'dd-MM-yyyy') : 'Nil'}</td><td class="cell">${item.deployed_date ? format(new Date(item.deployed_date), 'dd-MM-yyyy') : 'Nil'}</td><td class="cell">${item.client_remarks || 'Nil'}</td><td class="cell">${item.spr_remarks || 'Nil'}</td>`
                }</tr>`
        })
        html += `</table></body></html>`
        const blob = new Blob([html], { type: 'application/vnd.ms-excel' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    }

    const exportPDF = () => {
        try {
            console.log('Exporting PDF...', { view, selectedMeeting, selectedClient })
            const doc = new jsPDF()
            let currentY = 20
            if (view === 'meetings') {
                if (!selectedMeeting) {
                    console.error('No meeting selected for export')
                    return
                }
                doc.setFontSize(22); doc.setTextColor(41, 37, 36); doc.text('C² Action Board - Minutes', 14, currentY); currentY += 10
                doc.setFontSize(10); doc.setTextColor(120, 113, 108); doc.text(`Generated on ${format(new Date(), 'PPP p')} `, 14, currentY); currentY += 15
                doc.setDrawColor(231, 229, 228); doc.setFillColor(250, 250, 249); doc.rect(14, currentY, 182, 60, 'F')
                const contentStart = currentY + 10
                doc.setFontSize(14); doc.setTextColor(121, 67, 13); doc.setFont('helvetica', 'bold'); doc.text(selectedMeeting.title || 'Untitled Meeting', 20, contentStart)
                doc.setFontSize(10); doc.setTextColor(68, 64, 60); doc.setFont('helvetica', 'normal')
                doc.text(`Date: ${safeFormat(selectedMeeting.date, 'MMMM d, yyyy')}`, 20, contentStart + 8)
                doc.text(`Venue / Duration: ${[selectedMeeting.duration, selectedMeeting.venue].filter(Boolean).join(' | ') || 'N/A'} `, 20, contentStart + 14)
                doc.text(`Attendees: ${selectedMeeting.attendees || 'None specified'} `, 20, contentStart + 20)
                doc.setFont('helvetica', 'bold'); doc.text('Objective:', 20, contentStart + 28); doc.setFont('helvetica', 'normal')
                const objLines = doc.splitTextToSize(selectedMeeting.objective || 'No objective defined.', 140); doc.text(objLines, 45, contentStart + 28)
                currentY += 75
                doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text('Discussion Points', 14, currentY); currentY += 7
                doc.setFontSize(10); doc.setFont('helvetica', 'normal')
                const discLines = doc.splitTextToSize(selectedMeeting.discussion_points || 'No points recorded.', 180); doc.text(discLines, 14, currentY)
                currentY += (discLines.length * 5) + 15
                autoTable(doc, {
                    startY: currentY,
                    head: [['Status', 'Action Item', 'Assigned to', 'Due Date']],
                    body: filteredActionItems.map(item => [
                        calculateEffectiveStatus(item.status, item.due_date),
                        item.title || '-',
                        item.owner || '-',
                        safeFormat(item.due_date, 'MMM d')
                    ]),
                    headStyles: { fillColor: [121, 67, 13] }
                })
            } else {
                if (!selectedClient) {
                    console.error('No client selected for export')
                    return
                }
                doc.setFontSize(20); doc.text(`${selectedClient.name} - Project Tracker`, 14, currentY); currentY += 10
                doc.setFontSize(10); doc.text(`Report as of ${format(new Date(), 'dd-MMM-yyyy')} `, 14, currentY); currentY += 10
                autoTable(doc, {
                    startY: currentY,
                    head: [['Description', 'Class', 'Status', 'Raised', 'Dev Start', 'Deployed']],
                    body: filteredTrackerItems.map(item => [
                        item.description || 'Nil',
                        item.classification || 'Nil',
                        item.status || 'Nil',
                        safeFormat(item.raised_date, 'dd-MM-yy'),
                        safeFormat(item.dev_start_date, 'dd-MM-yy'),
                        safeFormat(item.deployed_date, 'dd-MM-yy')
                    ]),
                    headStyles: { fillColor: [121, 67, 13] }
                })
            }
            const fileNameRoot = (view === 'meetings' ? selectedMeeting?.title : (selectedWorkLog ? selectedWorkLog.name : selectedClient?.name)) || 'Report'
            const sanitizedFileName = fileNameRoot.replace(/[/\\?%*:|"<>]/g, '-')
            doc.save(`${sanitizedFileName}_Report.pdf`)
        } catch (err) {
            console.error('PDF Export Error:', err)
            alert('Failed to generate PDF. Please check console for details.')
        }
    }

    const handleCreateOrUpdateClient = async (e) => {
        e.preventDefault()
        if (editClient) {
            const { error } = await supabase.from('clients').update({ name: clientForm.name }).eq('id', editClient.id)
            if (error) return alert(error.message)
            if (selectedClient?.id === editClient.id) {
                setSelectedClient({ ...selectedClient, name: clientForm.name })
            }
        } else {
            // Check if client exists
            const { data: existing } = await supabase.from('clients').select('id').ilike('name', clientForm.name).maybeSingle()

            if (existing) {
                // Determine update based on current view
                const updatePayload = view === 'meetings' ? { show_in_meetings: true } : { show_in_tracker: true }
                await supabase.from('clients').update(updatePayload).eq('id', existing.id)
            } else {
                const payload = {
                    ...clientForm,
                    user_id: session.user.id,
                    show_in_meetings: view === 'meetings',
                    show_in_tracker: view === 'tracker'
                }
                await supabase.from('clients').insert([payload])
            }
        }
        setShowAddClient(false); setEditClient(null); fetchClients()
        setClientForm({ name: '' })
    }

    const handleCreateOrUpdateTrackerItem = async (e) => {
        e.preventDefault()
        // Convert empty strings to null for date fields to avoid Postgres errors
        const sanitizedForm = {
            ...trackerForm,
            raised_date: trackerForm.raised_date || null,
            dev_start_date: trackerForm.dev_start_date || null,
            deployed_date: trackerForm.deployed_date || null
        }
        const payload = { ...sanitizedForm, client_id: selectedClient.id, work_log_id: selectedWorkLog.id }
        if (editTrackerItem) await supabase.from('client_tracker_items').update(payload).eq('id', editTrackerItem.id)
        else await supabase.from('client_tracker_items').insert([payload])
        setShowAddTrackerItem(false); setEditTrackerItem(null); fetchTrackerItems(selectedWorkLog.id)
        setTrackerForm({ description: '', classification: 'issue', status: 'pending', raised_date: format(new Date(), 'yyyy-MM-dd'), dev_start_date: '', deployed_date: '', client_remarks: '', spr_remarks: '' })
    }

    const deleteTrackerItem = async (id) => {
        if (!confirm('Are you sure you want to delete this tracker item?')) return
        await supabase.from('client_tracker_items').delete().eq('id', id)
        fetchTrackerItems(selectedClient.id)
    }

    const handleCreateOrUpdateWorkLog = async (e) => {
        e.preventDefault()
        const payload = { ...workLogForm, client_id: selectedClient.id, user_id: session.user.id }
        if (editWorkLog) {
            const { error } = await supabase.from('work_logs').update({ name: workLogForm.name, date: workLogForm.date }).eq('id', editWorkLog.id)
            if (error) return alert(error.message)
            setWorkLogs(workLogs.map(wl => wl.id === editWorkLog.id ? { ...wl, ...workLogForm } : wl))
            if (selectedWorkLog?.id === editWorkLog.id) setSelectedWorkLog({ ...selectedWorkLog, ...workLogForm })
        } else {
            const { data, error } = await supabase.from('work_logs').insert([payload]).select()
            if (error) return alert(error.message)
            if (data) {
                setWorkLogs([data[0], ...workLogs])
                setSelectedWorkLog(data[0])
            }
        }
        setShowAddWorkLog(false); setEditWorkLog(null); setWorkLogForm({ name: '', date: format(new Date(), 'yyyy-MM-dd') })
    }

    const deleteWorkLog = async (id) => {
        if (!confirm('Are you sure? This will delete all tracker items in this log.')) return
        await supabase.from('work_logs').delete().eq('id', id)
        setWorkLogs(workLogs.filter(wl => wl.id !== id))
        if (selectedWorkLog?.id === id) setSelectedWorkLog(null)
    }

    const bulkDeleteWorkLogs = async () => {
        if (selectedWorkLogs.length === 0) return
        if (!window.confirm(`Delete ${selectedWorkLogs.length} work log(s)? This will also delete all related tracker items.`)) return
        const { error } = await supabase.from('work_logs').delete().in('id', selectedWorkLogs)
        if (error) return alert(error.message)
        setSelectedWorkLogs([])
        if (selectedClient) fetchWorkLogs(selectedClient.id)
    }

    const deleteClient = async (id) => {
        if (!confirm('Are you sure?')) return
        await supabase.from('clients').delete().eq('id', id)
        setClients(clients.filter(c => c.id !== id))
        if (selectedClient?.id === id) setSelectedClient(null)
    }

    const bulkDeleteActionItems = async () => {
        if (selectedActionItems.length === 0) return
        if (!window.confirm(`Delete ${selectedActionItems.length} action item(s)?`)) return
        const { error } = await supabase.from('action_items').delete().in('id', selectedActionItems)
        if (error) return alert(error.message)
        setSelectedActionItems([])
        if (selectedMeeting) fetchActionItems(selectedMeeting.id)
    }

    const bulkDeleteTrackerItems = async () => {
        if (selectedTrackerItems.length === 0) return
        if (!window.confirm(`Delete ${selectedTrackerItems.length} tracker item(s)?`)) return
        const { error } = await supabase.from('client_tracker_items').delete().in('id', selectedTrackerItems)
        if (error) return alert(error.message)
        setSelectedTrackerItems([])
        if (selectedClient) fetchTrackerItems(selectedClient.id)
    }

    const bulkDeleteClients = async () => {
        if (selectedClients.length === 0) return
        if (!window.confirm(`Remove ${selectedClients.length} client(s) from ${view === 'meetings' ? 'Meetings' : 'Work Log'} view?`)) return

        const updatePayload = view === 'meetings' ? { show_in_meetings: false } : { show_in_tracker: false }
        const { error } = await supabase.from('clients').update(updatePayload).in('id', selectedClients)

        if (error) return alert(error.message)
        setSelectedClients([])
        fetchClients()
    }

    const bulkDeleteMeetings = async () => {
        if (selectedMeetings.length === 0) return
        if (!window.confirm(`Delete ${selectedMeetings.length} meeting(s)? This will also delete all related action items.`)) return
        const { error } = await supabase.from('meetings').delete().in('id', selectedMeetings)
        if (error) return alert(error.message)
        setSelectedMeetings([])
        if (selectedClient) fetchClientMeetings(selectedClient.id)
    }
    const isOwner = userRole === 'Owner' || isAdmin
    const canEdit = userRole === 'Owner' || userRole === 'Editor' || isAdmin

    const filteredMeetings = meetings.filter(m => {
        const matchesSearch = (m.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (m.attendees || '').toLowerCase().includes(searchQuery.toLowerCase())
        const matchesDate = (!fromDate || m.date >= fromDate) && (!toDate || m.date <= toDate)
        return matchesSearch && matchesDate
    })

    const filteredActionItems = actionItems.filter(item => {
        const matchesSearch = (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item.owner || '').toLowerCase().includes(searchQuery.toLowerCase())
        return matchesSearch
    })

    const filteredTrackerItems = trackerItems.filter(item => {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
            (item.description || '').toLowerCase().includes(query) ||
            (item.classification || '').toLowerCase().includes(query) ||
            (item.status || '').toLowerCase().includes(query) ||
            (item.raised_date ? format(new Date(item.raised_date), 'dd-MM-yyyy').includes(query) : false) ||
            (item.dev_start_date ? format(new Date(item.dev_start_date), 'dd-MM-yyyy').includes(query) : false) ||
            (item.deployed_date ? format(new Date(item.deployed_date), 'dd-MM-yyyy').includes(query) : false) ||
            (format(new Date(item.created_at), 'dd-MM-yyyy').includes(query))

        const itemDate = item.created_at.split('T')[0]
        const matchesDate = (!fromDate || itemDate >= fromDate) && (!toDate || itemDate <= toDate)
        return matchesSearch && matchesDate
    })

    const filteredWorkLogs = workLogs.filter(wl => {
        const matchesSearch = (wl.name || '').toLowerCase().includes(searchQuery.toLowerCase())
        return matchesSearch
    })

    return (
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-main)' }}>
            <div
                style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: '72px', zIndex: 1100 }}
            >
                <nav style={{ width: '72px', backgroundColor: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 0', gap: '1rem', height: '100vh', zIndex: 1100 }}>
                    <div style={{ padding: '0.5rem', background: 'var(--primary)', borderRadius: '0.75rem', color: 'white', marginBottom: '2rem' }}><CheckSquare size={24} /></div>

                    <div className="nav-item">
                        <button
                            className={`btn-ghost ${view === 'home' ? 'active-nav' : ''}`}
                            style={{ padding: '0.75rem', borderRadius: '1rem', color: view === 'home' ? 'var(--primary)' : 'var(--text-muted)' }}
                            onClick={() => { setView('home'); setSelectedClient(null); setSelectedWorkLog(null); setSelectedMeeting(null); setSidebarOpen(true); clearFilters(); }}
                            title="Home"
                        >
                            <Home size={24} />
                        </button>
                    </div>

                    <div className="nav-item">
                        <button
                            className={`btn-ghost ${view === 'meetings' ? 'active-nav' : ''}`}
                            style={{ padding: '0.75rem', borderRadius: '1rem', color: view === 'meetings' ? 'var(--primary)' : 'var(--text-muted)' }}
                            onClick={() => { setView('meetings'); setSelectedClient(null); setSelectedWorkLog(null); setSidebarOpen(true); clearFilters(); }}
                            title="Meetings"
                        >
                            <Calendar size={24} />
                        </button>
                    </div>

                    <div className="nav-item">
                        <button
                            className={`btn-ghost ${view === 'tracker' ? 'active-nav' : ''}`}
                            style={{ padding: '0.75rem', borderRadius: '1rem', color: view === 'tracker' ? 'var(--primary)' : 'var(--text-muted)' }}
                            onClick={() => { setView('tracker'); setSelectedClient(null); setSelectedWorkLog(null); setSidebarOpen(false); clearFilters(); }}
                            title="Client Tracker"
                        >
                            <Target size={24} />
                        </button>
                    </div>

                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', width: '100%' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, textAlign: 'center', opacity: 0.6 }}>{format(new Date(), 'dd MMM').toUpperCase()}</div>
                        <button className="btn-ghost" onClick={toggleTheme}>{theme === 'light' ? '🌙' : '☀️'}</button>
                        <button className="btn-ghost" onClick={() => supabase.auth.signOut()}><LogOut size={20} /></button>
                    </div>
                </nav>
            </div>

            <div style={{ marginLeft: '72px', width: 'calc(100% - 72px)', padding: '0 2.5rem 2rem' }}>
                <header className="app-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-main)', paddingTop: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                        <div>
                            <h1 style={{ marginBottom: '0.25rem', color: '#d97706' }}>C² Action Board</h1>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}><Calendar size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }} />{format(new Date(), 'EEEE, MMMM do, yyyy')}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        <button className="btn btn-ghost" onClick={onOpenSettings}><SettingsIcon size={20} /> Settings</button>
                        <button className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }} onClick={() => supabase.auth.signOut()}><LogOut size={20} /> Sign Out</button>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--primary)', fontSize: '0.875rem', border: '2px solid var(--primary-soft)' }}>{session?.user?.email?.substring(0, 2).toUpperCase()}</div>
                    </div>
                </header>

                <main style={{ minWidth: 0, marginTop: '2rem' }}>
                    {view === 'home' ? (
                        <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
                            <div className="card" style={{ padding: '4rem 3rem', textAlign: 'center', background: 'var(--primary-soft)', border: 'none', borderRadius: '2rem', marginBottom: '3rem' }}>
                                <h1 style={{ fontSize: '3.5rem', marginBottom: '1rem', color: 'var(--primary)' }}>Welcome back, {userData?.full_name?.split(' ')[0] || 'Member'}</h1>
                                <div style={{ fontSize: '1.5rem', color: 'var(--text-muted)', marginBottom: '2.5rem', fontWeight: 500 }}>Your centralized workspace for action items and progress.</div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.5rem', background: 'var(--bg-card)', borderRadius: '3rem', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isAdmin ? '#10b981' : '#3b82f6' }}></div>
                                    <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '1rem' }}>{roleLabel}</span>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
                                <div className="card hover-card" onClick={() => setView('meetings')} style={{ cursor: 'pointer', padding: '2rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                        <div style={{ padding: '1rem', background: 'var(--primary-soft)', borderRadius: '1rem', color: 'var(--primary)' }}><Calendar size={28} /></div>
                                        <h2 style={{ margin: 0 }}>Meetings</h2>
                                    </div>
                                    <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>Access your meeting minutes, attendees, and related attachments. Manage your schedule and collaboration.</p>
                                </div>
                                <div className="card hover-card" onClick={() => setView('tracker')} style={{ cursor: 'pointer', padding: '2rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                        <div style={{ padding: '1rem', background: 'var(--accent-soft)', borderRadius: '1rem', color: 'var(--secondary)' }}><Target size={28} /></div>
                                        <h2 style={{ margin: 0 }}>Project Tracker</h2>
                                    </div>
                                    <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>Track issues, tasks, and queries across different clients. A simple, clear hub for tracking work and effort.</p>
                                </div>
                            </div>
                        </div>
                    ) : view === 'meetings' ? (
                        selectedMeeting ? (
                            <div className="animate-fade-in" key={selectedMeeting.id}>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <button className="btn btn-ghost" onClick={() => { setSelectedMeeting(null); clearFilters(); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', padding: 0 }}>
                                        <ChevronLeft size={20} /> Back to All Meetings
                                    </button>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <h1 style={{ fontSize: '2rem', margin: 0 }}>{selectedMeeting.title}</h1>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                                            <Calendar size={18} />
                                            <span>{format(new Date(selectedMeeting.date), 'MMMM d, yyyy')}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                        {isAdmin && <button className="btn btn-secondary" style={{ background: '#15803d' }} onClick={() => setShowShare(true)}><UserPlus size={18} /> Share</button>}
                                        <button className="btn btn-outline" onClick={exportPDF}><Download size={18} /> PDF</button>
                                        {isAdmin && <button className="btn btn-outline" onClick={() => setEditMeeting(selectedMeeting)}><Edit3 size={18} /> Edit</button>}
                                        {isAdmin && isOwner && <button className="btn btn-outline" style={{ color: 'var(--error)' }} onClick={() => deleteMeeting(selectedMeeting.id)}><Trash2 size={18} /></button>}
                                    </div>
                                </div>

                                <div className="card" style={{ padding: '2rem', marginBottom: '2rem', background: theme === 'light' ? '#fff9f2' : 'rgba(217, 119, 6, 0.1)', border: '1px solid ' + (theme === 'light' ? 'transparent' : 'rgba(217, 119, 6, 0.2)') }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                                <User size={14} /> Attendees
                                            </div>
                                            <div style={{ fontWeight: 600 }}>{selectedMeeting.attendees || 'None added'}</div>
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                                <Timer size={14} /> Duration & Venue
                                            </div>
                                            <div style={{ fontWeight: 600 }}>{[selectedMeeting.duration, selectedMeeting.venue].filter(Boolean).join(' | ') || 'Not specified'}</div>
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                                <Target size={14} /> Objective
                                            </div>
                                            <div style={{ fontWeight: 600 }}>{selectedMeeting.objective || 'No objective set'}</div>
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                            <MessageSquare size={14} /> Discussion Points
                                        </div>
                                        <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{selectedMeeting.discussion_points || 'No points recorded'}</div>
                                    </div>
                                </div>

                                <div className="card" style={{ marginBottom: '2rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <h3 style={{ fontSize: '1.5rem' }}>Action Items</h3>
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            {isAdmin && selectedActionItems.length > 0 && <button className="btn btn-outline" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} onClick={bulkDeleteActionItems}><Trash2 size={18} /> Delete Selected ({selectedActionItems.length})</button>}
                                            {isAdmin && <button className="btn btn-primary" style={{ background: '#d97706' }} onClick={() => setShowAddAction(true)}><Plus size={18} /> Add Action</button>}
                                        </div>
                                    </div>
                                    <div className="table-container">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th><input type="checkbox" onChange={(e) => setSelectedActionItems(e.target.checked ? filteredActionItems.map(i => i.id) : [])} checked={selectedActionItems.length === filteredActionItems.length && filteredActionItems.length > 0} /></th>
                                                    <th>Status</th><th>Action Item</th><th>Assigned to</th><th>Due Date</th>{canEdit && <th style={{ textAlign: 'right' }}>Actions</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredActionItems.map((item) => (
                                                    <tr key={item.id}>
                                                        <td><input type="checkbox" checked={selectedActionItems.includes(item.id)} onChange={() => setSelectedActionItems(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])} /></td>
                                                        <td>
                                                            <select
                                                                value={item.status}
                                                                disabled={!canEdit}
                                                                onChange={(e) => updateActionStatus(item.id, e.target.value)}
                                                                className={`badge ${getBadgeClass(calculateEffectiveStatus(item.status, item.due_date))}`}
                                                            >
                                                                {['Open', 'In Progress', 'Closed'].map(s => (
                                                                    <option key={s} value={s}>{s}</option>
                                                                ))}
                                                                {calculateEffectiveStatus(item.status, item.due_date) === 'Delayed' && (
                                                                    <option value="Open" disabled style={{ fontStyle: 'italic' }}> (Delayed)</option>
                                                                )}
                                                            </select>
                                                        </td>
                                                        <td style={{ fontWeight: 600 }}>{item.title}</td><td>{item.owner}</td><td>{item.due_date ? format(new Date(item.due_date), 'MMM d') : '-'}</td>
                                                        {isAdmin && <td style={{ textAlign: 'right' }}><button className="btn-ghost" onClick={() => setEditAction(item)}><Edit3 size={16} /></button><button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => deleteActionItem(item.id)}><Trash2 size={16} /></button></td>}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="card" style={{ padding: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}><Paperclip size={24} /><h3>Files</h3></div>
                                        {isAdmin && <label className="btn btn-primary" style={{ cursor: 'pointer', background: '#d97706' }}><Plus size={20} /> Add File<input type="file" hidden onChange={handleFileUpload} /></label>}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                        {attachments.map(att => (
                                            <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-sidebar)', borderRadius: '0.75rem' }}>
                                                <a href={att.signedUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}>{att.file_name}</a>
                                                {isAdmin && <div style={{ display: 'flex' }}><button className="btn-ghost" onClick={() => renameAttachment(att)}><Edit3 size={16} /></button><button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => deleteAttachment(att)}><Trash2 size={16} /></button></div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            selectedClient ? (
                                <div className="animate-fade-in" key="client-meetings">
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <button className="btn btn-ghost" onClick={() => { setSelectedClient(null); clearFilters(); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', padding: 0 }}>
                                            <ChevronLeft size={20} /> Back to Meetings
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <div>
                                            <h1 style={{ fontSize: '2rem', margin: 0 }}>All Meetings</h1>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                                                <span>Viewing meetings for <span style={{ color: '#d97706', fontWeight: 600 }}>{selectedClient.name}</span></span>
                                                {canEdit && <button className="btn-ghost" style={{ padding: '2px' }} onClick={() => { setEditClient(selectedClient); setClientForm({ name: selectedClient.name }); setShowAddClient(true); }}><Edit3 size={14} /></button>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-sidebar)', padding: '0.4rem 0.75rem', borderRadius: '0.75rem', marginRight: '0.5rem' }}>
                                                <Filter size={14} />
                                                <input type="date" className="input input-sm" style={{ background: 'transparent', border: 'none', color: 'var(--text-main)' }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
                                                <input type="date" className="input input-sm" style={{ background: 'transparent', border: 'none', color: 'var(--text-main)' }} value={toDate} onChange={e => setToDate(e.target.value)} />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={filteredMeetings.length > 0 && selectedMeetings.length === filteredMeetings.length}
                                                    onChange={(e) => setSelectedMeetings(e.target.checked ? filteredMeetings.map(m => m.id) : [])}
                                                    style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
                                                />
                                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Select All</span>
                                            </div>
                                            {isAdmin && selectedMeetings.length > 0 && <button className="btn btn-outline" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} onClick={bulkDeleteMeetings}><Trash2 size={18} /> Delete Selected ({selectedMeetings.length})</button>}
                                            {isAdmin && <button className="btn btn-primary" style={{ background: '#d97706' }} onClick={() => setShowAddMeeting(true)}><Plus size={18} /> New Meeting</button>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                                        {filteredMeetings.map(m => (
                                            <div key={m.id} className="card meeting-card" style={{ padding: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--border)', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                                                <div style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 10 }} onClick={(e) => e.stopPropagation()}>
                                                    <input type="checkbox" checked={selectedMeetings.includes(m.id)} onChange={(e) => setSelectedMeetings(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])} />
                                                </div>
                                                <div onClick={() => { setSelectedMeeting(m); clearFilters(); }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', marginLeft: '2rem' }}>
                                                        <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#d97706', maxWidth: '85%' }}>{m.title}</div>
                                                        <ChevronRight size={20} color="var(--text-muted)" />
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem', marginLeft: '2rem' }}>
                                                        <Calendar size={14} />
                                                        {format(new Date(m.date), 'MMMM d, yyyy')}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {filteredMeetings.length === 0 && (
                                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', background: 'var(--bg-sidebar)', borderRadius: '1rem', border: '2px dashed var(--border)' }}>
                                                <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>No meetings found for this client.</div>
                                                {isAdmin && <button className="btn btn-outline" onClick={() => setShowAddMeeting(true)}><Plus size={18} /> Create your first meeting</button>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="animate-fade-in">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <h1 style={{ fontSize: '2rem', margin: 0 }}>Meetings</h1>
                                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={clients.filter(c => c.show_in_meetings !== false && c.name.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 && selectedClients.length === clients.filter(c => c.show_in_meetings !== false && c.name.toLowerCase().includes(searchQuery.toLowerCase())).length}
                                                    onChange={(e) => {
                                                        const visibleClients = clients.filter(c => c.show_in_meetings !== false && c.name.toLowerCase().includes(searchQuery.toLowerCase()));
                                                        setSelectedClients(e.target.checked ? visibleClients.map(c => c.id) : []);
                                                    }}
                                                    style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
                                                />
                                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Select All</span>
                                            </div>
                                            {isAdmin && selectedClients.length > 0 && <button className="btn btn-outline" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} onClick={bulkDeleteClients}><Trash2 size={18} /> Delete Selected ({selectedClients.length})</button>}
                                            {isAdmin && <button className="btn btn-primary" style={{ background: '#d97706' }} onClick={() => setShowAddClient(true)}><Plus size={18} /> Add New Client</button>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                                        {clients.filter(c => c.show_in_meetings !== false && c.name.toLowerCase().includes(searchQuery.toLowerCase())).map(client => (
                                            <div key={client.id} className="card meeting-card" style={{ padding: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--border)', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                                                <div style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 10 }} onClick={(e) => e.stopPropagation()}>
                                                    <input type="checkbox" checked={selectedClients.includes(client.id)} onChange={(e) => setSelectedClients(prev => prev.includes(client.id) ? prev.filter(id => id !== client.id) : [...prev, client.id])} />
                                                </div>
                                                <div onClick={() => { setSelectedClient(client); fetchClientMeetings(client.id); checkClientRole(client); clearFilters(); }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', marginLeft: '2rem' }}>
                                                        <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#d97706' }}>{client.name}</div>
                                                        <ChevronRight size={20} color="var(--text-muted)" />
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem', marginLeft: '2rem' }}>
                                                        <Calendar size={14} /> View Meetings
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        )
                    ) : (
                        selectedClient ? (
                            selectedWorkLog ? (
                                <div className="animate-fade-in" key={selectedWorkLog.id}>
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <button className="btn btn-ghost" onClick={() => { setSelectedWorkLog(null); clearFilters(); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', padding: 0 }}>
                                            <ChevronLeft size={20} /> Back to Work Logs
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <h1 style={{ fontSize: '2rem', color: '#d97706', margin: 0 }}>Tracker - {selectedWorkLog.name}</h1>
                                                {canEdit && <button className="btn-ghost" style={{ color: '#d97706' }} onClick={() => { setEditWorkLog(selectedWorkLog); setWorkLogForm({ name: selectedWorkLog.name, date: selectedWorkLog.date }); setShowAddWorkLog(true); }}><Edit3 size={20} /></button>}
                                            </div>
                                            <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>as of {selectedWorkLog.date ? format(new Date(selectedWorkLog.date), 'dd-MMM-yyyy') : 'N/A'}</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                            <div style={{ position: 'relative', width: '220px' }}>
                                                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                                <input className="input input-sm" style={{ paddingLeft: '2.5rem', width: '100%', borderRadius: '0.75rem', background: 'var(--bg-sidebar)', border: 'none', color: 'var(--text-main)' }} placeholder="Search tracker..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-sidebar)', padding: '0.4rem 0.75rem', borderRadius: '0.75rem', marginRight: '0.5rem' }}>
                                                <Filter size={14} />
                                                <input type="date" className="input input-sm" style={{ background: 'transparent', border: 'none', color: 'var(--text-main)' }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
                                                <input type="date" className="input input-sm" style={{ background: 'transparent', border: 'none', color: 'var(--text-main)' }} value={toDate} onChange={e => setToDate(e.target.value)} />
                                            </div>
                                            {isAdmin && selectedTrackerItems.length > 0 && <button className="btn btn-outline" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} onClick={bulkDeleteTrackerItems}><Trash2 size={18} /> Bulk Delete ({selectedTrackerItems.length})</button>}
                                            {isAdmin && <button className="btn btn-secondary" onClick={() => setShowShare(true)}><UserPlus size={18} /> Share</button>}
                                            {isAdmin && <button className="btn btn-outline" onClick={() => setShowAddTrackerItem(true)}><Plus size={18} /> Add Item</button>}
                                            {isAdmin && <button className="btn btn-ghost" onClick={exportExcel}><Download size={18} /> Excel</button>}
                                        </div>
                                    </div>
                                    <div className="card" style={{ padding: 0 }}>
                                        <div className="table-container">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th><input type="checkbox" onChange={(e) => setSelectedTrackerItems(e.target.checked ? filteredTrackerItems.map(i => i.id) : [])} checked={selectedTrackerItems.length === filteredTrackerItems.length && filteredTrackerItems.length > 0} /></th>
                                                        <th>Description</th><th>Classification</th><th>Status</th><th>Raised Concern on</th><th>Dev Start Date</th><th>Deployed on</th><th>Created On</th>
                                                        {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredTrackerItems.map(item => (
                                                        <tr key={item.id} style={{
                                                            backgroundColor: item.status === 'completed'
                                                                ? (theme === 'light' ? '#f0fdf4' : 'rgba(22, 163, 74, 0.15)')
                                                                : (theme === 'light' ? '#fee2e2' : 'rgba(239, 68, 68, 0.15)'),
                                                            color: theme === 'light' ? 'inherit' : '#e5e7eb'
                                                        }}>
                                                            <td><input type="checkbox" checked={selectedTrackerItems.includes(item.id)} onChange={() => setSelectedTrackerItems(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])} /></td>
                                                            <td>{item.description}</td><td>{item.classification}</td><td><button className={`badge ${item.status === 'completed' ? 'badge-closed' : 'badge-open'}`} onClick={() => { const newStatus = item.status === 'completed' ? 'pending' : 'completed'; supabase.from('client_tracker_items').update({ status: newStatus }).eq('id', item.id).then(() => fetchTrackerItems(selectedWorkLog.id)); }}>{item.status}</button></td>
                                                            <td>{item.raised_date ? format(new Date(item.raised_date), 'dd-MM-yyyy') : '-'}</td>
                                                            <td>{item.dev_start_date ? format(new Date(item.dev_start_date), 'dd-MM-yyyy') : '-'}</td>
                                                            <td>{item.deployed_date ? format(new Date(item.deployed_date), 'dd-MM-yyyy') : '-'}</td>
                                                            <td>{format(new Date(item.created_at), 'dd-MM-yyyy')}</td>
                                                            {isAdmin && (
                                                                <td style={{ textAlign: 'right' }}>{canEdit && <button className="btn-ghost" onClick={() => { setEditTrackerItem(item); setTrackerForm(item); setShowAddTrackerItem(true); }}><Edit3 size={16} /></button>}{isOwner && <button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => deleteTrackerItem(item.id)}><Trash2 size={16} /></button>}</td>
                                                            )}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="animate-fade-in" key="work-logs">
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <button className="btn btn-ghost" onClick={() => { setSelectedClient(null); clearFilters(); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', padding: 0 }}>
                                            <ChevronLeft size={20} /> Back to Clients
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <h1 style={{ fontSize: '2rem', color: '#d97706', margin: 0 }}>{selectedClient.name}</h1>
                                                    {canEdit && <button className="btn-ghost" style={{ color: '#d97706' }} onClick={() => { setEditClient(selectedClient); setClientForm({ name: selectedClient.name }); setShowAddClient(true); }}><Edit3 size={20} /></button>}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={filteredWorkLogs.length > 0 && selectedWorkLogs.length === filteredWorkLogs.length}
                                                    onChange={(e) => setSelectedWorkLogs(e.target.checked ? filteredWorkLogs.map(wl => wl.id) : [])}
                                                    style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
                                                />
                                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Select All</span>
                                            </div>
                                            {selectedWorkLogs.length > 0 && <button className="btn btn-outline" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} onClick={bulkDeleteWorkLogs}><Trash2 size={18} /> Delete Selected ({selectedWorkLogs.length})</button>}
                                            {isAdmin && <button className="btn btn-primary" style={{ background: '#d97706' }} onClick={() => setShowAddWorkLog(true)}><Plus size={18} /> Create Work Log</button>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                                        {filteredWorkLogs.map(wl => (
                                            <div key={wl.id} className="card meeting-card" style={{ padding: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--border)', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                                                <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 10, display: 'flex', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                                                    {canEdit && <button className="btn-ghost" style={{ padding: '2px' }} onClick={() => { setEditWorkLog(wl); setWorkLogForm({ name: wl.name, date: wl.date }); setShowAddWorkLog(true); }}><Edit3 size={16} /></button>}
                                                    {isOwner && <button className="btn-ghost" style={{ color: 'var(--error)', padding: '2px' }} onClick={() => deleteWorkLog(wl.id)}><Trash2 size={16} /></button>}
                                                </div>
                                                <div style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 10 }} onClick={(e) => e.stopPropagation()}>
                                                    <input type="checkbox" checked={selectedWorkLogs.includes(wl.id)} onChange={(e) => setSelectedWorkLogs(prev => prev.includes(wl.id) ? prev.filter(id => id !== wl.id) : [...prev, wl.id])} />
                                                </div>
                                                <div onClick={() => { setSelectedWorkLog(wl); clearFilters(); }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', marginLeft: '2rem' }}>
                                                        <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#d97706' }}>{wl.name}</div>
                                                        <ChevronRight size={20} color="var(--text-muted)" />
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem', marginLeft: '2rem' }}>
                                                        <Calendar size={14} /> {format(new Date(wl.date), 'MMMM d, yyyy')}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="animate-fade-in">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                    <h1 style={{ fontSize: '2rem', margin: 0 }}>Client Tracker</h1>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
                                            <input
                                                type="checkbox"
                                                checked={clients.filter(c => c.show_in_tracker !== false && c.name.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 && selectedClients.length === clients.filter(c => c.show_in_tracker !== false && c.name.toLowerCase().includes(searchQuery.toLowerCase())).length}
                                                onChange={(e) => {
                                                    const visibleClients = clients.filter(c => c.show_in_tracker !== false && c.name.toLowerCase().includes(searchQuery.toLowerCase()));
                                                    setSelectedClients(e.target.checked ? visibleClients.map(c => c.id) : []);
                                                }}
                                                style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
                                            />
                                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Select All</span>
                                        </div>
                                        {isAdmin && selectedClients.length > 0 && <button className="btn btn-outline" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} onClick={bulkDeleteClients}><Trash2 size={18} /> Delete Selected ({selectedClients.length})</button>}
                                        {isAdmin && <button className="btn btn-primary" style={{ background: '#d97706' }} onClick={() => setShowAddClient(true)}><Plus size={18} /> Add New Client</button>}
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                                    {clients.filter(c => c.show_in_tracker !== false && c.name.toLowerCase().includes(searchQuery.toLowerCase())).map(client => (
                                        <div key={client.id} className="card meeting-card" style={{ padding: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--border)', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                                            <div style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 10 }} onClick={(e) => e.stopPropagation()}>
                                                <input type="checkbox" checked={selectedClients.includes(client.id)} onChange={(e) => setSelectedClients(prev => prev.includes(client.id) ? prev.filter(id => id !== client.id) : [...prev, client.id])} />
                                            </div>
                                            <div onClick={() => { setSelectedClient(client); fetchWorkLogs(client.id); checkClientRole(client); }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', marginLeft: '2rem' }}>
                                                    <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#d97706' }}>{client.name}</div>
                                                    <ChevronRight size={20} color="var(--text-muted)" />
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem', marginLeft: '2rem' }}>
                                                    <Target size={14} /> Open Records
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    )}
                </main>
            </div>
            {
                showShare && <ShareModal type={view === 'meetings' ? 'meeting' : 'client'} targetId={view === 'meetings' ? selectedMeeting?.id : selectedClient?.id} targetTitle={view === 'meetings' ? selectedMeeting?.title : selectedClient?.name} inviterName={session?.user?.email} onClose={() => setShowShare(false)} />
            }

            {
                (showAddAction || editAction) && (
                    <div className="modal-overlay" onClick={() => { setShowAddAction(false); setEditAction(null); }}>
                        <div className="card" style={{ maxWidth: '500px', padding: '2rem' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                <h2 style={{ fontSize: '1.75rem' }}>{editAction ? 'Edit' : 'New'} Action Item</h2>
                                <button className="btn-ghost" onClick={() => { setShowAddAction(false); setEditAction(null); }}><X size={24} /></button>
                            </div>
                            <form onSubmit={handleCreateOrUpdateAction} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>What needs to be done?</label>
                                    <textarea className="textarea" placeholder="Google Maps integration commercial need to be shared." value={actionForm.title} onChange={e => setActionForm({ ...actionForm, title: e.target.value })} required />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Assigned to</label>
                                        <input className="input" placeholder="Akshita" value={actionForm.owner} onChange={e => setActionForm({ ...actionForm, owner: e.target.value })} required />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Due Date</label>
                                        <input type="date" className="input" value={actionForm.due_date} onChange={e => setActionForm({ ...actionForm, due_date: e.target.value })} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                    <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowAddAction(false); setEditAction(null); }}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" style={{ flex: 1, background: '#d97706' }}>{editAction ? 'Update Item' : 'Create Item'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {
                (showAddMeeting || editMeeting) && (
                    <div className="modal-overlay" onClick={() => { setShowAddMeeting(false); setEditMeeting(null); }}>
                        <div className="card" style={{ maxWidth: '700px', padding: '2rem' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                <h2 style={{ fontSize: '1.75rem' }}>{editMeeting ? 'Edit' : 'New'} Meeting</h2>
                                <button className="btn-ghost" onClick={() => { setShowAddMeeting(false); setEditMeeting(null); }}><X size={24} /></button>
                            </div>
                            <form onSubmit={handleCreateOrUpdateMeeting} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Meeting Title</label>
                                        <input className="input" placeholder="e.g. Design Review" value={meetingForm.title} onChange={e => setMeetingForm({ ...meetingForm, title: e.target.value })} required />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Date</label>
                                        <input type="date" className="input" value={meetingForm.date} onChange={e => setMeetingForm({ ...meetingForm, date: e.target.value })} required />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Attendees (Member, Firm)</label>
                                        <input className="input" placeholder="Alice (Design), Bob (Eng)" value={meetingForm.attendees} onChange={e => setMeetingForm({ ...meetingForm, attendees: e.target.value })} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Venue & Duration</label>
                                        <input className="input" placeholder="Room A, 60m" value={meetingForm.venue_duration} onChange={e => {
                                            const rawValue = e.target.value
                                            const parts = rawValue.split(',')
                                            setMeetingForm({
                                                ...meetingForm,
                                                venue_duration: rawValue,
                                                duration: parts[0] || '',
                                                venue: parts[1] || ''
                                            })
                                        }} />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Meeting Objective</label>
                                    <input className="input" placeholder="Define core features for Q3" value={meetingForm.objective} onChange={e => setMeetingForm({ ...meetingForm, objective: e.target.value })} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Discussion Points</label>
                                    <textarea className="textarea" style={{ minHeight: '120px' }} placeholder="Key takeaways and notes..." value={meetingForm.discussion_points} onChange={e => setMeetingForm({ ...meetingForm, discussion_points: e.target.value })} />
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                    <button type="button" className="btn btn-outline" style={{ border: 'none', flex: 1 }} onClick={() => { setShowAddMeeting(false); setEditMeeting(null); }}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" style={{ flex: 1, background: '#d97706' }}>{editMeeting ? 'Update Meeting' : 'Create Meeting'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {showAddClient && (
                <div className="modal-overlay" onClick={() => { setShowAddClient(false); setEditClient(null); setClientForm({ name: '' }); }}>
                    <div className="card" style={{ maxWidth: '400px', padding: '2rem' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '1.5rem' }}>{editClient ? 'Rename Client' : 'New Client'}</h2>
                        <form onSubmit={handleCreateOrUpdateClient} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <input className="input" placeholder="Client Name" value={clientForm.name} onChange={e => setClientForm({ name: e.target.value })} required autoFocus />
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowAddClient(false); setEditClient(null); setClientForm({ name: '' }); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1, background: '#d97706' }}>{editClient ? 'Update' : 'Save'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {
                (showAddTrackerItem || editTrackerItem) && (
                    <div className="modal-overlay" onClick={() => { setShowAddTrackerItem(false); setEditTrackerItem(null); }}>
                        <div className="card" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                            <h2>{editTrackerItem ? 'Edit' : 'New'} Tracker Item</h2>
                            <form onSubmit={handleCreateOrUpdateTrackerItem} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Description</label>
                                    <textarea className="textarea" placeholder="Enter concern description..." value={trackerForm.description} onChange={e => setTrackerForm({ ...trackerForm, description: e.target.value })} required />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Classification</label>
                                        <select className="input" value={trackerForm.classification} onChange={e => setTrackerForm({ ...trackerForm, classification: e.target.value })}><option value="issue">Issue</option><option value="changes">Changes</option><option value="client clarification">Client Clarification</option><option value="new requirement">New Requirement</option></select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Status</label>
                                        <select className="input" value={trackerForm.status} onChange={e => setTrackerForm({ ...trackerForm, status: e.target.value })}><option value="pending">Pending</option><option value="completed">Completed</option></select>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8rem' }}>Raised Concern on</label>
                                        <input type="date" className="input" value={trackerForm.raised_date} onChange={e => setTrackerForm({ ...trackerForm, raised_date: e.target.value })} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8rem' }}>Dev Start Date</label>
                                        <input type="date" className="input" value={trackerForm.dev_start_date} onChange={e => setTrackerForm({ ...trackerForm, dev_start_date: e.target.value })} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8rem' }}>Deployed on</label>
                                        <input type="date" className="input" value={trackerForm.deployed_date} onChange={e => setTrackerForm({ ...trackerForm, deployed_date: e.target.value })} />
                                    </div>
                                </div>
                                <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>Save Changes</button>
                            </form>
                        </div>
                    </div>
                )
            }
            {showAddWorkLog && (
                <div className="modal-overlay" onClick={() => { setShowAddWorkLog(false); setEditWorkLog(null); }}>
                    <div className="card" style={{ maxWidth: '400px', padding: '2rem' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '1.5rem' }}>{editWorkLog ? 'Rename Work Log' : 'New Work Log'}</h2>
                        <form onSubmit={handleCreateOrUpdateWorkLog} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Log Name</label>
                                <input className="input" placeholder="e.g. Weekly Update" value={workLogForm.name} onChange={e => setWorkLogForm({ ...workLogForm, name: e.target.value })} required autoFocus />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Date</label>
                                <input type="date" className="input" value={workLogForm.date} onChange={e => setWorkLogForm({ ...workLogForm, date: e.target.value })} required />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowAddWorkLog(false); setEditWorkLog(null); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1, background: '#d97706' }}>{editWorkLog ? 'Update' : 'Save'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
