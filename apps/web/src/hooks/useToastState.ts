import { useCallback, useState } from 'react'

export type ToastTone = 'success' | 'info' | 'warning' | 'error'

export interface ToastState {
  message: string
  tone: ToastTone
}

export function useToastState() {
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback((msg: string, tone: ToastTone = 'info') => {
    setToast({ message: msg, tone })
    setTimeout(() => setToast(null), 2400)
  }, [])

  return { toast, showToast }
}
