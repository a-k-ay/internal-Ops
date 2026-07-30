export default function Badge({ value, type }) {
  const cls = type || value?.toLowerCase().replace(/\s+/g, '_') || 'default'
  const labels = {
    open: 'Open', in_progress: 'In Progress', closed: 'Closed', delayed: 'Delayed',
    pending: 'Pending', issue: 'Issue', new_requirement: 'New Requirement',
    change_request: 'Change Request', tbd: 'TBD',
    super_admin: 'Super Admin', pm: 'PM', member: 'Member',
    active: 'Active', archived: 'Archived',
  }
  return <span className={`badge badge-${cls}`}>{labels[cls] || value}</span>
}
