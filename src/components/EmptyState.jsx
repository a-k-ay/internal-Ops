export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state">
      {Icon && <div className="empty-state-icon"><Icon size={24} /></div>}
      <h4 style={{ marginBottom: '0.375rem' }}>{title}</h4>
      {description && <p style={{ fontSize: '0.875rem', maxWidth: '320px' }}>{description}</p>}
      {action && <div style={{ marginTop: '1.25rem' }}>{action}</div>}
    </div>
  )
}
