// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyToastTone, useToastState } from '@/hooks/useToastState'

type ToastHookResult = ReturnType<typeof useToastState>

function Harness({ onReady }: { onReady: (state: ToastHookResult) => void }) {
  onReady(useToastState())
  return null
}

describe('useToastState', () => {
  let container: HTMLDivElement
  let root: Root
  let state: ToastHookResult | null

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    state = null
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  function getHook(): ToastHookResult {
    if (!state) throw new Error('Hook not initialized')
    return state
  }

  function mountHook() {
    act(() => {
      root.render(<Harness onReady={(value) => { state = value }} />)
    })
  }

  describe('classifyToastTone', () => {
    it('preserves explicit non-info tones', () => {
      expect(classifyToastTone('Custom alert', 'error')).toBe('error')
      expect(classifyToastTone('Custom warning', 'warning')).toBe('warning')
      expect(classifyToastTone('Custom success', 'success')).toBe('success')
    })

    it('infers error tone for failures and permission issues', () => {
      expect(classifyToastTone('Could not reach the server.')).toBe('error')
      expect(classifyToastTone('You do not have permission for this action.')).toBe('error')
      expect(classifyToastTone('Task update failed.')).toBe('error')
      expect(classifyToastTone('Roadmap name cannot be empty.')).toBe('error')
      expect(classifyToastTone('Save rejected by server.')).toBe('error')
      expect(classifyToastTone('Your access was revoked.')).toBe('error')
    })

    it('infers warning tone for conflicts and expired sessions', () => {
      expect(classifyToastTone('Session expired. Rejoin through an active invite link.')).toBe('warning')
      expect(classifyToastTone('This task changed on the server. Reload or review the conflict.')).toBe('warning')
      expect(classifyToastTone('Save or discard your edits first.')).toBe('warning')
      expect(classifyToastTone('Alice is already working on this task.')).toBe('warning')
      expect(classifyToastTone('Circular dependency detected')).toBe('warning')
    })

    it('infers success tone for persistence and creation', () => {
      expect(classifyToastTone('Saved and ready to share.')).toBe('success')
      expect(classifyToastTone('Checkpoint created.')).toBe('success')
      expect(classifyToastTone('Restored roadmap')).toBe('success')
      expect(classifyToastTone('Participant revoked')).toBe('success')
      expect(classifyToastTone('New link generated - copy it now')).toBe('success')
    })

    it('defaults to info for neutral messages', () => {
      expect(classifyToastTone('Viewing snapshot as guest.')).toBe('info')
    })
  })

  describe('deduplication and timing', () => {
    it('deduplicates identical messages and refreshes dismiss timer', () => {
      mountHook()

      act(() => {
        getHook().showToast('Could not reach the server.')
      })

      expect(getHook().toasts).toHaveLength(1)
      expect(getHook().toasts[0].message).toBe('Could not reach the server.')
      expect(getHook().toasts[0].tone).toBe('error')

      // Advance halfway through timer
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(getHook().toasts).toHaveLength(1)

      // Re-trigger same toast message
      act(() => {
        getHook().showToast('Could not reach the server.')
      })

      // Must remain deduplicated (length 1)
      expect(getHook().toasts).toHaveLength(1)

      // Advance by another 2000ms (total 4000ms from start)
      // Because timer was refreshed, it must still be visible!
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(getHook().toasts).toHaveLength(1)

      // Advance past remaining duration (total 3200ms from second trigger)
      act(() => {
        vi.advanceTimersByTime(1300)
      })
      expect(getHook().toasts).toHaveLength(0)
    })

    it('allows distinct messages up to max visible queue', () => {
      mountHook()

      act(() => {
        getHook().showToast('First message')
        getHook().showToast('Second message')
        getHook().showToast('Third message')
      })

      expect(getHook().toasts).toHaveLength(3)
      expect(getHook().toasts.map((t) => t.message)).toEqual([
        'First message',
        'Second message',
        'Third message',
      ])
    })

    it('upgrades tone when same message is shown with higher severity', () => {
      mountHook()

      act(() => {
        getHook().showToast('Custom notice', 'info')
      })
      expect(getHook().toasts[0].tone).toBe('info')

      act(() => {
        getHook().showToast('Custom notice', 'error')
      })
      expect(getHook().toasts).toHaveLength(1)
      expect(getHook().toasts[0].tone).toBe('error')
    })
  })
})
