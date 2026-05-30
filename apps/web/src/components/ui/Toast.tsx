'use client'

import type { ToastTone } from '@/hooks/useToastState'

interface ToastProps {
  message: string
  tone?: ToastTone
}

export function Toast({ message, tone = 'info' }: ToastProps) {
  return (
    <div className={`toast toast-${tone}`}>
      <span className="dot" />
      {message}
    </div>
  )
}
