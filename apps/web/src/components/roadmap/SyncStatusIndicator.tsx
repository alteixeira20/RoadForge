'use client'

import { useEffect, useRef, useState } from 'react'
import type { WorkspaceSyncStatus } from '@/lib/sync-status'

interface SyncStatusIndicatorProps {
  status: WorkspaceSyncStatus
}

const TRANSIENT_DELAY_MS = 300
const TRANSIENT_MIN_VISIBLE_MS = 700

const STATUS_LABELS: Record<WorkspaceSyncStatus, string> = {
  local: 'Local draft',
  live: 'Live',
  saving: 'Saving…',
  updating: 'Updating…',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
  conflict: 'Conflict',
}

function isTransient(status: WorkspaceSyncStatus): boolean {
  return status === 'saving' || status === 'updating'
}

function isUrgent(status: WorkspaceSyncStatus): boolean {
  return status === 'offline' || status === 'conflict'
}

export function SyncStatusIndicator({ status }: SyncStatusIndicatorProps) {
  const [displayedStatus, setDisplayedStatus] = useState(status)
  const transientShownAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (status === displayedStatus) return

    let delay = 0
    if (isTransient(status)) {
      delay = TRANSIENT_DELAY_MS
    } else if (
      !isUrgent(status)
      && isTransient(displayedStatus)
      && transientShownAtRef.current !== null
    ) {
      const elapsed = Date.now() - transientShownAtRef.current
      delay = Math.max(0, TRANSIENT_MIN_VISIBLE_MS - elapsed)
    }

    const timer = window.setTimeout(() => {
      setDisplayedStatus(status)
      transientShownAtRef.current = isTransient(status) ? Date.now() : null
    }, delay)
    return () => window.clearTimeout(timer)
  }, [displayedStatus, status])

  return (
    <div
      className={`sync-status-indicator is-${displayedStatus}`}
      role="status"
      aria-live="polite"
      aria-label={`Roadmap status: ${STATUS_LABELS[displayedStatus]}`}
    >
      <span className="sync-status-dot" aria-hidden="true" />
      <span>{STATUS_LABELS[displayedStatus]}</span>
    </div>
  )
}
