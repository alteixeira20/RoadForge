'use client'

import { Icon } from '@/components/ui/Icon'
import type { ToastState } from '@/hooks/useToastState'

interface ToastViewportProps {
  toasts: ToastState[]
  onDismiss: (id: number) => void
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.tone}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span className="dot" aria-hidden />
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
