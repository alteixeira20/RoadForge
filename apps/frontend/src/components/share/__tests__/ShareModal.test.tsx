// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareModal } from '@/components/share/ShareModal'
import { ApiError } from '@/services/roadmap-http'

const roadmapDataMock = vi.hoisted(() => ({
  isPasswordEnabled: false,
  setIsPasswordEnabled: vi.fn(),
}))

const roadmapSessionMock = vi.hoisted(() => ({
  serverRoadmapId: null as string | null,
  sessionToken: null as string | null,
  role: 'owner' as string | null,
}))

const updateRoadmapPasswordMock = vi.hoisted(() => vi.fn())

vi.mock('@/context/RoadmapContext', () => ({
  useRoadmapData: () => roadmapDataMock,
  useRoadmapSession: () => roadmapSessionMock,
}))

vi.mock('@/services/roadmap-sharing.service', () => ({
  getParticipants: vi.fn().mockResolvedValue([]),
  getShareLinks: vi.fn().mockResolvedValue([]),
  regenerateShareLink: vi.fn(),
  revokeParticipant: vi.fn(),
  revokeShareLink: vi.fn(),
  updateRoadmapPassword: updateRoadmapPasswordMock,
}))

describe('ShareModal local fallback', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    roadmapSessionMock.serverRoadmapId = null
    roadmapSessionMock.sessionToken = null
    roadmapSessionMock.role = 'owner'
    roadmapDataMock.isPasswordEnabled = false
    roadmapDataMock.setIsPasswordEnabled.mockClear()
    updateRoadmapPasswordMock.mockClear()

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

describe('ShareModal owner password management', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    roadmapSessionMock.serverRoadmapId = 'road-test-123'
    roadmapSessionMock.sessionToken = 'token-owner-456'
    roadmapSessionMock.role = 'owner'
    roadmapDataMock.isPasswordEnabled = false
    roadmapDataMock.setIsPasswordEnabled.mockClear()
    updateRoadmapPasswordMock.mockClear()

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

  it('renders password section when server roadmap and owner session are active', () => {
    act(() => {
      root.render(<ShareModal open={true} onClose={vi.fn()} onToast={vi.fn()} />)
    })

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('Roadmap password')
    expect(dialog.textContent).toContain('No password required')
    const setBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Set password'),
    )
    expect(setBtn).toBeDefined()
  })

  it('allows owner to set a new password with validation', async () => {
    const onToast = vi.fn()
    updateRoadmapPasswordMock.mockResolvedValueOnce({ isPasswordEnabled: true })

    act(() => {
      root.render(<ShareModal open={true} onClose={vi.fn()} onToast={onToast} />)
    })

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    const setBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Set password'),
    )!
    act(() => setBtn.click())

    const input = dialog.querySelector('.roadmap-password-input') as HTMLInputElement
    expect(input).toBeDefined()

    // Test validation: input < 6 chars
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!
      setter.call(input, '12345')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const saveBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save'),
    )!
    await act(async () => {
      saveBtn.click()
    })

    expect(dialog.textContent).toContain('Password must be at least 6 characters.')
    expect(updateRoadmapPasswordMock).not.toHaveBeenCalled()

    // Test valid password submission
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!
      setter.call(input, 'secret-road-pass')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      saveBtn.click()
    })

    expect(updateRoadmapPasswordMock).toHaveBeenCalledWith(
      'road-test-123',
      'secret-road-pass',
      'token-owner-456',
    )
    expect(roadmapDataMock.setIsPasswordEnabled).toHaveBeenCalledWith(true)
    expect(onToast).toHaveBeenCalledWith('Password set')
  })

  it('allows owner to remove an existing password', async () => {
    roadmapDataMock.isPasswordEnabled = true
    const onToast = vi.fn()
    updateRoadmapPasswordMock.mockResolvedValueOnce({ isPasswordEnabled: false })

    act(() => {
      root.render(<ShareModal open={true} onClose={vi.fn()} onToast={onToast} />)
    })

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('Password protected')

    const removeBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Remove password'),
    )!
    expect(removeBtn).toBeDefined()

    await act(async () => {
      removeBtn.click()
    })

    expect(updateRoadmapPasswordMock).toHaveBeenCalledWith(
      'road-test-123',
      null,
      'token-owner-456',
    )
    expect(roadmapDataMock.setIsPasswordEnabled).toHaveBeenCalledWith(false)
    expect(onToast).toHaveBeenCalledWith('Password removed')
  })

  it('shows error toast when forbidden/auth error occurs', async () => {
    const onToast = vi.fn()
    updateRoadmapPasswordMock.mockRejectedValueOnce(new ApiError(403, 'Forbidden'))

    act(() => {
      root.render(<ShareModal open={true} onClose={vi.fn()} onToast={onToast} />)
    })

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    const setBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Set password'),
    )!
    act(() => setBtn.click())

    const input = dialog.querySelector('.roadmap-password-input') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!
      setter.call(input, 'correct-length-password')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const saveBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save'),
    )!
    await act(async () => {
      saveBtn.click()
    })

    expect(onToast).toHaveBeenCalledWith('Only the owner can manage the roadmap password.')
  })
})
