// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StorageWriteFailureBanner } from '@/components/ui/StorageWriteFailureBanner'
import {
  STORAGE_WRITE_ERROR_EVENT,
  type StorageWriteFailureDetail,
} from '@/lib/storage'

describe('StorageWriteFailureBanner', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<StorageWriteFailureBanner />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('shows a persistent alert for rejected local writes and can be dismissed', () => {
    const detail: StorageWriteFailureDetail = {
      reason: 'quota',
      scope: 'roadmap',
      occurredAt: '2026-08-04T12:00:00Z',
    }

    act(() => {
      window.dispatchEvent(new CustomEvent(STORAGE_WRITE_ERROR_EVENT, { detail }))
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Local save failed')
    expect(alert?.textContent).toContain('Browser storage is full')
    expect(alert?.textContent).toContain('Export the roadmap as JSON now')

    const dismiss = container.querySelector('button')
    expect(dismiss).not.toBeNull()
    act(() => dismiss?.click())
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})
