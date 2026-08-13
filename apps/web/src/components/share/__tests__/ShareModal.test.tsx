// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareModal } from '@/components/share/ShareModal'

vi.mock('@/context/RoadmapContext', () => ({
  useRoadmapData: () => ({ isPasswordEnabled: false }),
  useRoadmapSession: () => ({
    serverRoadmapId: null,
    sessionToken: null,
    role: 'owner',
  }),
}))

vi.mock('@/services/roadmap-sharing.service', () => ({
  getParticipants: vi.fn(),
  getShareLinks: vi.fn(),
  regenerateShareLink: vi.fn(),
  revokeParticipant: vi.fn(),
  revokeShareLink: vi.fn(),
}))

describe('ShareModal local fallback', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('never exposes fake or copyable credential links without a server roadmap', () => {
    act(() => {
      root.render(<ShareModal open={true} onClose={vi.fn()} onToast={vi.fn()} />)
    })

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('not generated')
    expect(dialog.querySelector('button.copy')).toBeNull()
    expect(dialog.querySelector('code')).toBeNull()
    expect(dialog.textContent).not.toContain('roadforge.anvilary.tools/r/')
  })

  it('describes viewer access as a read-only invite rather than public publishing', () => {
    act(() => {
      root.render(<ShareModal open={true} onClose={vi.fn()} onToast={vi.fn()} />)
    })

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('Read-only viewer invite')
    expect(dialog.textContent).toContain('not public publishing links')
    expect(dialog.textContent).not.toContain('Public viewer link')
    expect(dialog.textContent).not.toContain('Generate public link')
  })
})
