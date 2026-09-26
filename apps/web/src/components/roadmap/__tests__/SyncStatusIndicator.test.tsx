// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncStatusIndicator } from '@/components/roadmap/SyncStatusIndicator'
import type { WorkspaceSyncStatus } from '@/lib/sync-status'

describe('SyncStatusIndicator', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  function renderIndicator(status: WorkspaceSyncStatus) {
    act(() => {
      root.render(<SyncStatusIndicator status={status} />)
    })
  }

  function getIndicator(): HTMLElement {
    const el = container.querySelector('.sync-status-indicator')
    if (!el) throw new Error('Indicator not found in DOM')
    return el as HTMLElement
  }

  it('renders initial live state with polite role', () => {
    renderIndicator('live')
    const el = getIndicator()
    expect(el.textContent).toBe('Live')
    expect(el.getAttribute('role')).toBe('status')
    expect(el.getAttribute('aria-live')).toBe('polite')
  })

  it('keeps normal background saving completely silent if completed within debounce window', () => {
    renderIndicator('live')
    expect(getIndicator().textContent).toBe('Live')

    // Save starts
    renderIndicator('saving')

    // 500ms into the save
    act(() => {
      vi.advanceTimersByTime(500)
    })
    // Must remain visually silent (not flashing "Saving…")
    expect(getIndicator().textContent).toBe('Live')

    // Save completes successfully
    renderIndicator('live')

    // Advance past the initial debounce window
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    // Never left "Live"
    expect(getIndicator().textContent).toBe('Live')
  })

  it('keeps normal remote updates completely silent if completed within debounce window', () => {
    renderIndicator('live')

    // Remote SSE update arrives
    renderIndicator('updating')

    // 600ms elapsed
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(getIndicator().textContent).toBe('Live')

    // Incoming update applied
    renderIndicator('live')

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(getIndicator().textContent).toBe('Live')
  })

  it('keeps brief network reconnects unobtrusive without flashing', () => {
    renderIndicator('live')

    // Brief disconnect/reconnect
    renderIndicator('reconnecting')

    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(getIndicator().textContent).toBe('Live')

    renderIndicator('live')

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(getIndicator().textContent).toBe('Live')
  })

  it('displays saving status when save takes longer than the debounce threshold', () => {
    renderIndicator('live')
    renderIndicator('saving')

    // Advance to 2000ms
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(getIndicator().textContent).toBe('Saving…')

    // Save completes
    renderIndicator('live')

    // Enforces minimum visible time before switching back
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(getIndicator().textContent).toBe('Saving…')

    act(() => {
      vi.advanceTimersByTime(350)
    })
    expect(getIndicator().textContent).toBe('Live')
  })

  it('displays urgent errors immediately with alert role and assertive live region', () => {
    renderIndicator('live')

    // Offline event occurs
    renderIndicator('offline')
    expect(getIndicator().textContent).toBe('Offline')
    expect(getIndicator().getAttribute('role')).toBe('alert')
    expect(getIndicator().getAttribute('aria-live')).toBe('assertive')

    // Conflict event occurs
    renderIndicator('conflict')
    expect(getIndicator().textContent).toBe('Conflict')
    expect(getIndicator().getAttribute('role')).toBe('alert')
    expect(getIndicator().getAttribute('aria-live')).toBe('assertive')

    // Save error occurs
    renderIndicator('error')
    expect(getIndicator().textContent).toBe('Save needs attention')
    expect(getIndicator().getAttribute('role')).toBe('alert')
    expect(getIndicator().getAttribute('aria-live')).toBe('assertive')

    // Access lost occurs
    renderIndicator('access-lost')
    expect(getIndicator().textContent).toBe('Access lost')
    expect(getIndicator().getAttribute('role')).toBe('alert')
    expect(getIndicator().getAttribute('aria-live')).toBe('assertive')
  })

  it('cuts in immediately with urgent state even if transient timer is pending', () => {
    renderIndicator('live')
    renderIndicator('saving')

    // 500ms into pending save, conflict occurs
    act(() => {
      vi.advanceTimersByTime(500)
    })
    renderIndicator('conflict')

    // Immediately shows Conflict without waiting
    expect(getIndicator().textContent).toBe('Conflict')
    expect(getIndicator().getAttribute('role')).toBe('alert')
  })

  it('never displays stale status when status changes while a timer is in flight', () => {
    renderIndicator('live')
    renderIndicator('updating')

    // Wait until updating is displayed after 2000ms
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(getIndicator().textContent).toBe('Updating…')

    // Status transitions to live (transient min visible delay begins)
    renderIndicator('live')

    // Before min visible timer completes, status transitions to offline
    act(() => {
      vi.advanceTimersByTime(100)
    })
    renderIndicator('offline')

    // Offline must show immediately and never be overwritten by stale live timer
    expect(getIndicator().textContent).toBe('Offline')

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(getIndicator().textContent).toBe('Offline')
  })
})
