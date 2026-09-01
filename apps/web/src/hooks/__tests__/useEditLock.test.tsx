// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditLock } from '@/hooks/useEditLock'
import { acquireLock, releaseLock } from '@/services/roadmap-locks.service'
import { ApiConnectionError, ApiError } from '@/services/roadmap-http'

vi.mock('@/config/capabilities', () => ({
  TEAM_FEATURES_ENABLED: true,
}))
vi.mock('@/services/roadmap-locks.service', () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}))

const mockedAcquireLock = vi.mocked(acquireLock)
const mockedReleaseLock = vi.mocked(releaseLock)
type Params = Parameters<typeof useEditLock>[0]
type Result = ReturnType<typeof useEditLock>

function Harness({
  params,
  onResult,
}: {
  params: Params
  onResult: (result: Result) => void
}) {
  onResult(useEditLock(params))
  return null
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('useEditLock in team mode', () => {
  let container: HTMLDivElement
  let root: Root
  let result: Result
  let params: Params

  const render = () => {
    act(() => {
      root.render(
        <Harness
          params={params}
          onResult={(nextResult) => {
            result = nextResult
          }}
        />,
      )
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    mockedAcquireLock.mockReset()
    mockedReleaseLock.mockReset()
    mockedAcquireLock.mockResolvedValue({
      roadmap_id: 'rm_1',
      target: 'task:tk_1',
      participant_id: 'pt_1',
      display_name: 'Alex',
      expires_at: '2026-07-25T18:00:00Z',
    })
    mockedReleaseLock.mockResolvedValue(undefined)
    params = {
      target: 'task:tk_1',
      active: true,
      serverRoadmapId: 'rm_1',
      sessionToken: 'session-token',
      onAcquireError: vi.fn(),
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    render()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('grants a local lock without network calls', async () => {
    params = { ...params, serverRoadmapId: null, sessionToken: null }
    render()

    await act(async () => {
      expect(await result.tryAcquire()).toBe(true)
    })

    expect(result.ownsLock).toBe(true)
    expect(mockedAcquireLock).not.toHaveBeenCalled()
    expect(mockedReleaseLock).not.toHaveBeenCalled()
  })

  it('acquires and deduplicates an explicit release', async () => {
    await act(async () => {
      expect(await result.tryAcquire()).toBe(true)
    })

    await act(async () => {
      await Promise.all([result.release(), result.release()])
    })

    expect(mockedAcquireLock).toHaveBeenCalledTimes(1)
    expect(mockedReleaseLock).toHaveBeenCalledTimes(1)
    expect(result.ownsLock).toBe(false)
  })

  it('classifies only typed 409 errors as lock conflicts', async () => {
    const onAcquireError = vi.fn()
    params = { ...params, onAcquireError }
    render()
    mockedAcquireLock
      .mockRejectedValueOnce(new ApiError(409, 'Locked'))
      .mockRejectedValueOnce(new ApiConnectionError())

    await act(async () => {
      expect(await result.tryAcquire()).toBe(false)
      expect(await result.tryAcquire()).toBe(false)
    })

    expect(onAcquireError).toHaveBeenNthCalledWith(1, true)
    expect(onAcquireError).toHaveBeenNthCalledWith(2, false)
  })

  it('refreshes after 20 seconds and treats refresh failure as lock loss', async () => {
    await act(async () => {
      await result.tryAcquire()
    })
    mockedAcquireLock.mockRejectedValueOnce(new ApiConnectionError())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })

    expect(mockedAcquireLock).toHaveBeenCalledTimes(2)
    expect(result.ownsLock).toBe(false)
  })

  it('releases when editing becomes inactive without a duplicate unmount release', async () => {
    await act(async () => {
      await result.tryAcquire()
    })
    params = { ...params, active: false }
    render()
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockedReleaseLock).toHaveBeenCalledTimes(1)
  })

  it('cleans up a successful acquire that finishes after cancellation', async () => {
    const pending = deferred<Awaited<ReturnType<typeof acquireLock>>>()
    mockedAcquireLock.mockReturnValueOnce(pending.promise)
    let acquisition!: Promise<boolean>
    act(() => {
      acquisition = result.tryAcquire()
    })

    params = { ...params, active: false }
    render()
    pending.resolve({
      roadmap_id: 'rm_1',
      target: 'task:tk_1',
      participant_id: 'pt_1',
      display_name: 'Alex',
      expires_at: '2026-07-25T18:00:00Z',
    })

    await act(async () => {
      expect(await acquisition).toBe(false)
    })

    expect(mockedReleaseLock).toHaveBeenCalledTimes(1)
    expect(result.ownsLock).toBe(false)
  })
})
