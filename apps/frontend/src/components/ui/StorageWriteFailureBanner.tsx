'use client'

import { useEffect, useState } from 'react'
import {
  STORAGE_WRITE_ERROR_EVENT,
  type StorageWriteFailureDetail,
} from '@/lib/storage'

function failureMessage(detail: StorageWriteFailureDetail): string {
  if (detail.reason === 'quota') {
    return 'Browser storage is full. Recent changes may not survive a reload.'
  }
  if (detail.reason === 'blocked') {
    return 'Browser storage is blocked. Recent changes may not survive a reload.'
  }
  return 'RoadForge could not save recent changes in this browser.'
}

export function StorageWriteFailureBanner() {
  const [failure, setFailure] = useState<StorageWriteFailureDetail | null>(null)

  useEffect(() => {
    const handleFailure = (event: Event) => {
      const detail = (event as CustomEvent<StorageWriteFailureDetail>).detail
      if (detail) setFailure(detail)
    }
    window.addEventListener(STORAGE_WRITE_ERROR_EVENT, handleFailure)
    return () => window.removeEventListener(STORAGE_WRITE_ERROR_EVENT, handleFailure)
  }, [])

  if (!failure) return null

  return (
    <div className="storage-write-alert" role="alert" aria-live="assertive">
      <div className="storage-write-alert-copy">
        <strong>Local save failed</strong>
        <span>
          {failureMessage(failure)} Export the roadmap as JSON now, then free browser
          storage or allow site storage before continuing.
        </span>
      </div>
      <button
        type="button"
        className="btn sm"
        onClick={() => setFailure(null)}
        aria-label="Dismiss local save failure warning"
      >
        Dismiss
      </button>
    </div>
  )
}
