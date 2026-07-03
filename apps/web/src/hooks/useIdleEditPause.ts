'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getIdleDeadline,
  hasEditorBecomeIdle,
  INLINE_EDIT_IDLE_TIMEOUT_MS,
} from '@/lib/editor-idle'

interface UseIdleEditPauseParams {
  active: boolean
  timeoutMs?: number
}

interface UseIdleEditPauseResult {
  isIdlePaused: boolean
  lastInteractionAt: number | null
  recordInteraction: () => void
  resumeEditing: () => void
}

export function useIdleEditPause({
  active,
  timeoutMs = INLINE_EDIT_IDLE_TIMEOUT_MS,
}: UseIdleEditPauseParams): UseIdleEditPauseResult {
  const [isIdlePaused, setIsIdlePaused] = useState(false)
  const [lastInteractionAt, setLastInteractionAt] = useState<number | null>(null)
  const lastInteractionRef = useRef<number | null>(null)

  const updateLastInteraction = useCallback(() => {
    const now = Date.now()
    lastInteractionRef.current = now
    setLastInteractionAt(now)
  }, [])

  const recordInteraction = useCallback(() => {
    if (!active || isIdlePaused) return
    updateLastInteraction()
  }, [active, isIdlePaused, updateLastInteraction])

  const resumeEditing = useCallback(() => {
    setIsIdlePaused(false)
    updateLastInteraction()
  }, [updateLastInteraction])

  useEffect(() => {
    if (!active) {
      lastInteractionRef.current = null
      setLastInteractionAt(null)
      setIsIdlePaused(false)
      return
    }
    if (lastInteractionRef.current === null) updateLastInteraction()
  }, [active, updateLastInteraction])

  useEffect(() => {
    if (!active || isIdlePaused || lastInteractionAt === null) return

    const pauseIfIdle = () => {
      const lastInteraction = lastInteractionRef.current
      if (lastInteraction === null) return
      if (hasEditorBecomeIdle(Date.now(), lastInteraction, timeoutMs)) {
        setIsIdlePaused(true)
      }
    }
    const delay = Math.max(0, getIdleDeadline(lastInteractionAt, timeoutMs) - Date.now())
    const timer = window.setTimeout(pauseIfIdle, delay)
    return () => window.clearTimeout(timer)
  }, [active, isIdlePaused, lastInteractionAt, timeoutMs])

  return {
    isIdlePaused,
    lastInteractionAt,
    recordInteraction,
    resumeEditing,
  }
}
