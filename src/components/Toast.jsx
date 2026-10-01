import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'

/**
 * Non-blocking toast notifications. The provider owns a queue; each call to
 * useToast() returns helpers that push onto it. Each toast auto-dismisses
 * after `duration` ms (default 4000) and is dismissible by click.
 *
 * Usage:
 *   const toast = useToast()
 *   toast.error('Failed to delete')
 *   toast.success('Saved')
 *   toast.info('Export ready')
 */

const ToastContext = createContext(null)

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((variant, message, duration = 4000) => {
    const id = nextId++
    setToasts(t => [...t, { id, variant, message }])
    if (duration > 0) {
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
    }
    return id
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const value = {
    error:   (m, d) => push('error',   m, d),
    success: (m, d) => push('success', m, d),
    info:    (m, d) => push('info',    m, d),
    warning: (m, d) => push('warning', m, d),
    dismiss,
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

function ToastContainer({ toasts, dismiss }) {
  if (!toasts.length) return null
  return (
    <div className="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
    </div>
  )
}

function ToastItem({ toast, onDismiss }) {
  // Fade in on mount by toggling a class after the next frame.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(r)
  }, [])

  const Icon = { success: CheckCircle2, error: AlertCircle, warning: AlertCircle, info: Info }[toast.variant] || Info
  return (
    <div className={`toast toast-${toast.variant}${visible ? ' is-visible' : ''}`} role="alert">
      <Icon size={18} className="toast-icon" />
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  )
}
