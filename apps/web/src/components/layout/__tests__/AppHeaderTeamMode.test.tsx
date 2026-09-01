// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppHeader } from '@/components/layout/AppHeader'

vi.mock('@/config/capabilities', () => ({
  TEAM_FEATURES_ENABLED: true,
}))
vi.mock('@/components/roadmap/RoadmapSwitcher', () => ({
  RoadmapSwitcher: () => null,
}))

describe('AppHeader in team mode', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('keeps the active Share control available to an owner of a server-backed roadmap', () => {
    const onShare = vi.fn()
    act(() => {
      root.render(
        <AppHeader
          roadmapName="Team roadmap"
          syncStatus="live"
          canManageShare
          onShare={onShare}
        />,
      )
    })

    const share = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Share',
    )
    expect(share).toBeDefined()
    expect(share?.disabled).toBe(false)
    expect(container.textContent).not.toContain('Soon')

    act(() => {
      share?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onShare).toHaveBeenCalledTimes(1)
  })
})
