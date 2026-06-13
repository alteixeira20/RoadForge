import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastTone = 'success' | 'info' | 'warning' | 'error'

export interface ToastState {
  id: number
  message: string
  tone: ToastTone
}

const TOAST_DURATION_MS = 3200

export function useToastState() {
  const [toasts, setToasts] = useState<ToastState[]>([])
  const nextIdRef = useRef(1)
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id)
    if (timer) clearTimeout(timer)
    timersRef.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextIdRef.current++
    setToasts((current) => [...current.slice(-3), { id, message, tone }])
    const timer = setTimeout(() => dismissToast(id), TOAST_DURATION_MS)
    timersRef.current.set(id, timer)
  }, [dismissToast])

  useEffect(() => () => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current.clear()
  }, [])

  return { toasts, showToast, dismissToast }
}
