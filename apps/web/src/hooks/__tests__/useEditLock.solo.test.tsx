// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditLock } from '@/hooks/useEditLock'
import { acquireLock, releaseLock } from '@/services/roadmap-locks.service'

vi.mock('@/config/capabilities', () => ({
  TEAM_FEATURES_ENABLED: false,
}))
vi.mock('@/services/roadmap-locks.service', () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}))

const mockedAcquireLock = vi.mocked(acquireLock)
const mockedReleaseLock = vi.mocked(releaseLock)
type Result = ReturnType<typeof useEditLock>

function Harness({ onResult }: { onResult: (result: Result) => void }) {
  onResult(useEditLock({
    target: 'task:tk_1',
    active: true,
    serverRoadmapId: 'rm_1',
    sessionToken: 'session-token',
  }))
  return null
}

describe('useEditLock in solo mode', () => {
  let container: HTMLDivElement
  let root: Root
  let result: Result
  let intervalSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    intervalSpy = vi.spyOn(globalThis, 'setInterval')
    mockedAcquireLock.mockReset()
    mockedReleaseLock.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(<Harness onResult={(nextResult) => { result = nextResult }} />)
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not acquire or release a server lock for a server-backed roadmap', async () => {
    await act(async () => {
      expect(await result.tryAcquire()).toBe(true)
      await result.release()
    })

    expect(mockedAcquireLock).not.toHaveBeenCalled()
    expect(mockedReleaseLock).not.toHaveBeenCalled()
  })

  it('does not create a lock-refresh interval or refresh over time', async () => {
    await act(async () => {
      expect(await result.tryAcquire()).toBe(true)
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(intervalSpy).not.toHaveBeenCalled()
    expect(mockedAcquireLock).not.toHaveBeenCalled()
    expect(mockedReleaseLock).not.toHaveBeenCalled()
  })
})
