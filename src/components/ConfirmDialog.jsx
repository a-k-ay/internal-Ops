import Modal from './Modal'
import { AlertTriangle } from 'lucide-react'

export default function ConfirmDialog({ title, message, onConfirm, onCancel, danger = true }) {
  return (
    <Modal title={title} onClose={onCancel} maxWidth="420px"
      footer={
        <>
          <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>Confirm</button>
        </>
      }
    >
      <div className="flex gap-3 items-center">
        <div style={{ color: 'var(--warning)', flexShrink: 0 }}><AlertTriangle size={22} /></div>
        <p style={{ color: 'var(--text-main)' }}>{message}</p>
      </div>
    </Modal>
  )
}
