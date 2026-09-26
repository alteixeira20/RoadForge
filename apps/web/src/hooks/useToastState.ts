import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastTone = 'success' | 'info' | 'warning' | 'error'

export interface ToastState {
  id: number
  message: string
  tone: ToastTone
}

const TOAST_DURATION_MS = 3200

export function classifyToastTone(message: string, explicitTone?: ToastTone): ToastTone {
  if (explicitTone && explicitTone !== 'info') {
    return explicitTone
  }

  const lower = message.toLowerCase()

  // Error indicators: failures, authorization/permission issues, deletions, invalid input
  if (
    lower.includes('error') ||
    lower.includes('failed') ||
    lower.includes('failure') ||
    lower.includes('could not') ||
    lower.includes('cannot') ||
    lower.includes('unable to') ||
    lower.includes('rejected') ||
    lower.includes('deleted') ||
    lower.includes('permission') ||
    lower.includes('only the owner') ||
    lower.includes('forbidden') ||
    lower.includes('unauthorized') ||
    lower.includes('needs attention') ||
    (lower.includes('revoked') && !lower.includes('participant revoked') && !lower.includes('link revoked'))
  ) {
    return 'error'
  }

  // Warning indicators: conflicts, expired sessions, blockers, unsaved changes
  if (
    lower.includes('conflict') ||
    lower.includes('expired') ||
    lower.includes('rejoin') ||
    lower.includes('discard') ||
    lower.includes('warning') ||
    lower.includes('blocked') ||
    lower.includes('already working') ||
    lower.includes('still owns this claim') ||
    lower.includes('reload the server') ||
    lower.includes('reload or review') ||
    lower.includes('require at least') ||
    lower.includes('circular dependency')
  ) {
    return 'warning'
  }

  // Success indicators: completion, persistence, link/participant actions
  if (
    lower.includes('saved') ||
    lower.includes('reloaded') ||
    lower.includes('checkpoint created') ||
    lower.includes('restored') ||
    lower.includes('downloaded') ||
    lower.includes('new link generated') ||
    lower.includes('link revoked') ||
    lower.includes('participant revoked') ||
    lower.includes('task updated') ||
    lower.includes('subtask added') ||
    lower.includes('dependency linked') ||
    lower.includes('dependency removed')
  ) {
    return 'success'
  }

  return explicitTone ?? 'info'
}

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

  const showToast = useCallback((message: string, tone?: ToastTone) => {
    const resolvedTone = classifyToastTone(message, tone)

    setToasts((current) => {
      const existing = current.find((toast) => toast.message === message)
      if (existing) {
        // Reset the dismissal timer so user has full viewing time from the latest trigger
        const timer = timersRef.current.get(existing.id)
        if (timer) clearTimeout(timer)
        const nextTimer = setTimeout(() => dismissToast(existing.id), TOAST_DURATION_MS)
        timersRef.current.set(existing.id, nextTimer)

        if (existing.tone !== resolvedTone) {
          return current.map((t) => (t.id === existing.id ? { ...t, tone: resolvedTone } : t))
        }
        return current
      }

      const id = nextIdRef.current++
      const nextTimer = setTimeout(() => dismissToast(id), TOAST_DURATION_MS)
      timersRef.current.set(id, nextTimer)
      return [...current.slice(-3), { id, message, tone: resolvedTone }]
    })
  }, [dismissToast])

  useEffect(() => () => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current.clear()
  }, [])

  return { toasts, showToast, dismissToast }
}
