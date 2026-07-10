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
  const lastInteractionRef = useRef<number | null>(null)
  const pauseTimerRef = useRef<number | null>(null)

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current)
      pauseTimerRef.current = null
    }
  }, [])

  // Self-rescheduling ref-based timer. Reading/writing `lastInteractionRef`
  // here never triggers a re-render, so typing (which calls this via
  // recordInteraction on every keystroke) cannot force parent components to
  // re-render and lose input focus/caret position.
  const schedulePauseCheck = useCallback(() => {
    clearPauseTimer()
    const lastInteraction = lastInteractionRef.current
    if (lastInteraction === null) return

    const delay = Math.max(0, getIdleDeadline(lastInteraction, timeoutMs) - Date.now())
    pauseTimerRef.current = window.setTimeout(() => {
      const current = lastInteractionRef.current
      if (current === null) return
      if (hasEditorBecomeIdle(Date.now(), current, timeoutMs)) {
        setIsIdlePaused(true)
      } else {
        schedulePauseCheck()
      }
    }, delay)
  }, [clearPauseTimer, timeoutMs])

  const updateLastInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now()
    schedulePauseCheck()
  }, [schedulePauseCheck])

  // Intentionally does not call setState: this runs on every keystroke/
  // interaction while actively editing, and only the ref + timer deadline
  // need to move. A re-render here would remount/reflow editors mid-typing.
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
      clearPauseTimer()
      setIsIdlePaused(false)
      return
    }
    if (lastInteractionRef.current === null) updateLastInteraction()
    return clearPauseTimer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => clearPauseTimer, [clearPauseTimer])

  return {
    isIdlePaused,
    lastInteractionAt: lastInteractionRef.current,
    recordInteraction,
    resumeEditing,
  }
}
