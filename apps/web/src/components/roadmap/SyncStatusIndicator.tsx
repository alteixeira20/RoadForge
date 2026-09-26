'use client'

import { useEffect, useRef, useState } from 'react'
import type { WorkspaceSyncStatus } from '@/lib/sync-status'

interface SyncStatusIndicatorProps {
  status: WorkspaceSyncStatus
}

// Background saves and incoming SSE updates that complete within 2000ms
// remain visually silent to prevent distracting label flashing during normal collaboration.
const TRANSIENT_SAVE_UPDATE_DELAY_MS = 2000

// Brief network reconnections (under 2500ms) remain unobtrusive.
const TRANSIENT_RECONNECT_DELAY_MS = 2500

// When a transient status is shown, keep it visible briefly before returning to steady state.
const TRANSIENT_MIN_VISIBLE_MS = 500

const STATUS_LABELS: Record<WorkspaceSyncStatus, string> = {
  local: 'Local draft',
  live: 'Live',
  saving: 'Saving…',
  updating: 'Updating…',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
  'access-lost': 'Access lost',
  conflict: 'Conflict',
  error: 'Save needs attention',
}

function isTransient(status: WorkspaceSyncStatus): boolean {
  return status === 'saving' || status === 'updating' || status === 'reconnecting'
}

function isUrgent(status: WorkspaceSyncStatus): boolean {
  return status === 'offline' || status === 'conflict' || status === 'error' || status === 'access-lost'
}

function getTransientDelay(status: WorkspaceSyncStatus): number {
  if (status === 'reconnecting') return TRANSIENT_RECONNECT_DELAY_MS
  if (status === 'saving' || status === 'updating') return TRANSIENT_SAVE_UPDATE_DELAY_MS
  return 0
}

export function SyncStatusIndicator({ status }: SyncStatusIndicatorProps) {
  const [displayedStatus, setDisplayedStatus] = useState(status)
  const transientShownAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (status === displayedStatus) return

    let delay = 0
    if (isUrgent(status)) {
      // Urgent errors, conflicts, or permission losses display immediately.
      delay = 0
    } else if (isTransient(status)) {
      delay = getTransientDelay(status)
    } else if (
      isTransient(displayedStatus) &&
      transientShownAtRef.current !== null
    ) {
      // Transitioning away from a displayed transient status: enforce minimum visibility
      const elapsed = Date.now() - transientShownAtRef.current
      delay = Math.max(0, TRANSIENT_MIN_VISIBLE_MS - elapsed)
    }

    if (delay === 0) {
      setDisplayedStatus(status)
      transientShownAtRef.current = null
      return
    }

    const timer = window.setTimeout(() => {
      setDisplayedStatus(status)
      transientShownAtRef.current = isTransient(status) ? Date.now() : null
    }, delay)

    return () => window.clearTimeout(timer)
  }, [displayedStatus, status])

  const urgent = isUrgent(displayedStatus)

  return (
    <div
      className={`sync-status-indicator is-${displayedStatus}`}
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      aria-label={`Roadmap status: ${STATUS_LABELS[displayedStatus]}`}
    >
      <span className="sync-status-dot" aria-hidden="true" />
      <span>{STATUS_LABELS[displayedStatus]}</span>
    </div>
  )
}
