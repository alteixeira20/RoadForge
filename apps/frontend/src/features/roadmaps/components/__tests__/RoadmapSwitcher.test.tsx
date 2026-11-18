// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoadmapSwitcher } from '@/features/roadmaps/components/RoadmapSwitcher'
import { storage } from '@/shared/storage/storage'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/shared/context/roadmap-context', () => {
  const context = () => ({
    displayName: 'Test User',
    activeRoadmapId: 'roadmap-1',
    activateRoadmap: vi.fn(),
    removeRoadmapFromBrowser: vi.fn(),
  })
  return {
    useRoadmapData: () => context(),
    useRoadmapSession: () => context(),
    useRoadmapLifecycle: () => context(),
  }
})

describe('RoadmapSwitcher overlay', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    window.localStorage.clear()
    window.sessionStorage.clear()
    storage.setRoadmapCache('roadmap-1', {
      roadmapName: 'Release roadmap',
      phases: [],
      saved: false,
      ownerDisplayName: null,
      updatedAt: null,
      isPasswordEnabled: false,
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('uses the shared portalled dialog lifecycle and returns focus on Escape', () => {
    act(() => root.render(<RoadmapSwitcher />))
    const trigger = container.querySelector(
      '[aria-label="Roadmaps and session"]',
    ) as HTMLButtonElement

    act(() => trigger.click())

    const dialog = document.body.querySelector(
      '#roadmap-switcher-dialog[role="dialog"]',
    ) as HTMLElement
    expect(dialog).toBeInstanceOf(HTMLElement)
    expect(container.contains(dialog)).toBe(false)
    expect(dialog.textContent).toContain('Release roadmap')
    expect(document.activeElement).toBe(dialog.querySelector('button'))

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }))
    })

    expect(document.body.querySelector('#roadmap-switcher-dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps the invite form keyboard-reachable within the dialog', () => {
    act(() => root.render(<RoadmapSwitcher />))
    const trigger = container.querySelector(
      '[aria-label="Roadmaps and session"]',
    ) as HTMLButtonElement
    act(() => trigger.click())
    const dialog = document.body.querySelector('#roadmap-switcher-dialog') as HTMLElement
    const addByInvite = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Add by invite link'),
    ) as HTMLButtonElement

    act(() => addByInvite.click())

    expect(dialog.querySelector('input')).toBeInstanceOf(HTMLInputElement)
    expect(dialog.scrollHeight).toBeGreaterThanOrEqual(dialog.clientHeight)
  })
})
