// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useRoadmapRealtime,
  type LockMap,
  type UseRoadmapRealtimeParams,
  type UseRoadmapRealtimeReturn,
} from '@/hooks/useRoadmapRealtime'
import { storage } from '@/lib/storage'
import { getRoadmap } from '@/services/roadmap-crud.service'
import { getLocks } from '@/services/roadmap-locks.service'
import {
  getEventTicket,
  subscribeToRoadmapEvents,
  type RealtimeHandlers,
} from '@/services/roadmap-realtime.service'
import { ApiConnectionError, ApiError } from '@/services/roadmap-http'
import type { Phase, Roadmap } from '@/types/roadmap'

vi.mock('@/services/roadmap-crud.service', () => ({
  getRoadmap: vi.fn(),
}))
vi.mock('@/services/roadmap-locks.service', () => ({
  getLocks: vi.fn(),
}))
vi.mock('@/services/roadmap-realtime.service', () => ({
  getEventTicket: vi.fn(),
  subscribeToRoadmapEvents: vi.fn(),
}))

const mockedGetRoadmap = vi.mocked(getRoadmap)
const mockedGetLocks = vi.mocked(getLocks)
const mockedGetEventTicket = vi.mocked(getEventTicket)
const mockedSubscribe = vi.mocked(subscribeToRoadmapEvents)

const phase: Phase = {
  id: 'phase-1',
  num: '01',
  name: 'Planning',
  color: '#76746e',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [],
}

const loadedRoadmap: Roadmap = {
  project: { id: 'rm_1', name: 'Server roadmap' },
  roadmap: { id: 'rm_1', name: 'Server roadmap', isPasswordEnabled: true },
  phases: [phase],
  tagRegistry: [{ id: 'planning', label: 'Planning' }],
  ownerDisplayName: 'Owner',
  updatedAt: '2026-07-25T18:00:00Z',
}

function Harness({
  params,
  onResult,
}: {
  params: UseRoadmapRealtimeParams
  onResult: (result: UseRoadmapRealtimeReturn) => void
}) {
  onResult(useRoadmapRealtime(params))
  return null
}

function createParams(savedRef = { current: true }) {
  return {
    params: {
      connection: {
        serverRoadmapId: 'rm_1',
        sessionToken: 'session-token',
        participantId: 'pt_self',
        role: 'editor' as const,
        activeRoadmapId: 'local_1',
      },
      lifecycle: {
        isHydratingServer: false,
        backendUnavailableRoadmapId: null,
        savedRef,
        showUpgradeNoticeOnce: vi.fn(),
        setBackendUnavailableRoadmapId: vi.fn(),
      },
      roadmapState: {
        setRoadmapNameState: vi.fn(),
        setPhasesState: vi.fn(),
        setSavedState: vi.fn(),
        setTagRegistryState: vi.fn(),
      },
      sessionState: {
        setServerRoadmapIdState: vi.fn(),
        setSessionTokenState: vi.fn(),
        setParticipantIdState: vi.fn(),
        setRoleState: vi.fn(),
      },
      metadataState: {
        setOwnerDisplayNameState: vi.fn(),
        setUpdatedAtState: vi.fn(),
        setIsPasswordEnabledState: vi.fn(),
      },
      lockState: {
        setLocks: vi.fn(),
      },
    } satisfies UseRoadmapRealtimeParams,
    savedRef,
  }
}

async function flushSubscription() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

// Lets a test control exactly when an async dependency (here, getRoadmap)
// resolves, so races between it and a revocation/error/unmount can be
// reproduced deterministically instead of guessed at with timing.
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// For stale-callback isolation tests: captures each subscribeToRoadmapEvents
// call's own handler set and its own unsubscribe mock, instead of the
// single shared `handlers`/`unsubscribe` the rest of this suite uses (which
// the subscribe mock overwrites on every call) - a stale callback must
// never be able to observe or mutate a replacement connection's separate
// EventSource/handler set, so distinguishing them is the whole point.
function captureSubscriptions() {
  const calls: { handlers: RealtimeHandlers; unsubscribe: ReturnType<typeof vi.fn> }[] = []
  mockedSubscribe.mockReset().mockImplementation((_id, nextHandlers) => {
    const unsub = vi.fn()
    calls.push({ handlers: nextHandlers, unsubscribe: unsub })
    return unsub
  })
  return calls
}

describe('useRoadmapRealtime', () => {
  let container: HTMLDivElement
  let root: Root
  let handlers: RealtimeHandlers
  let unsubscribe: ReturnType<typeof vi.fn>
  let result: UseRoadmapRealtimeReturn

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    handlers = {}
    unsubscribe = vi.fn()
    mockedGetRoadmap.mockReset().mockResolvedValue(loadedRoadmap)
    mockedGetLocks.mockReset().mockResolvedValue([{
      roadmap_id: 'rm_1',
      target: 'task:tk_1',
      participant_id: 'pt_other',
      display_name: 'Sam',
      expires_at: '2026-07-25T18:00:00Z',
    }])
    mockedGetEventTicket.mockReset().mockResolvedValue({
      expires_in: 30,
    })
    mockedSubscribe.mockReset().mockImplementation((_id, nextHandlers) => {
      handlers = nextHandlers
      return unsubscribe
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (params: UseRoadmapRealtimeParams) => {
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

  it('hydrates locks, resyncs, and only then reports live', async () => {
    const { params } = createParams()
    render(params)
    await flushSubscription()

    expect(params.lockState.setLocks).toHaveBeenCalledWith({
      'task:tk_1': { participantId: 'pt_other', displayName: 'Sam' },
    })
    expect(mockedSubscribe).toHaveBeenCalledWith(
      'rm_1',
      expect.any(Object),
    )

    act(() => handlers.onOpen?.())
    // Authoritative refetch gates the transition - not live yet.
    expect(result.realtimeStatus).toBe('updating')
    expect(mockedGetRoadmap).toHaveBeenCalledWith('rm_1', 'session-token', { signal: expect.any(AbortSignal) })

    await flushSubscription()
    expect(result.realtimeStatus).toBe('live')
  })

  it('does not run two connection attempts concurrently and retries with backoff using a fresh ticket', async () => {
    vi.useFakeTimers()
    try {
      mockedGetEventTicket
        .mockResolvedValueOnce({ expires_in: 30 })
        .mockResolvedValueOnce({ expires_in: 30 })

      const { params } = createParams()
      render(params)
      await flushSubscription()
      expect(mockedGetEventTicket).toHaveBeenCalledTimes(1)

      act(() => handlers.onError?.(new Event('error')))
      expect(result.realtimeStatus).toBe('reconnecting')
      // A retry is scheduled, not fired immediately, and no second attempt
      // starts while it is pending.
      expect(mockedGetEventTicket).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })

      expect(mockedGetEventTicket).toHaveBeenCalledTimes(2)
      expect(mockedSubscribe).toHaveBeenLastCalledWith('rm_1', expect.any(Object))
    } finally {
      vi.useRealTimers()
    }
  })

  it('accelerates a pending retry when the browser reports back online', async () => {
    vi.useFakeTimers()
    try {
      const { params } = createParams()
      render(params)
      await flushSubscription()

      act(() => handlers.onError?.(new Event('error')))
      expect(result.realtimeStatus).toBe('reconnecting')
      const ticketCallsBeforeOnline = mockedGetEventTicket.mock.calls.length

      await act(async () => {
        window.dispatchEvent(new Event('online'))
        await Promise.resolve()
        await Promise.resolve()
      })

      // The retry fired immediately rather than waiting out its backoff.
      expect(mockedGetEventTicket.mock.calls.length).toBeGreaterThan(ticketCallsBeforeOnline)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops retrying once access is revoked, even as time advances', async () => {
    vi.useFakeTimers()
    try {
      const { params } = createParams()
      render(params)
      await flushSubscription()

      act(() => handlers.onParticipantRevoked?.({
        roadmap_id: 'rm_1',
        participant_id: 'pt_self',
        revoked_at: '2026-07-25T18:05:00Z',
      }))
      expect(result.realtimeStatus).toBe('access-lost')

      const ticketCallsAfterRevoke = mockedGetEventTicket.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })

      expect(mockedGetEventTicket).toHaveBeenCalledTimes(ticketCallsAfterRevoke)
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers automatically from a transient getLocks() connection failure', async () => {
    vi.useFakeTimers()
    try {
      mockedGetLocks.mockReset().mockRejectedValueOnce(new ApiConnectionError())
      mockedGetLocks.mockResolvedValue([])
      mockedGetEventTicket.mockReset()
        .mockResolvedValueOnce({ expires_in: 30 })

      const { params } = createParams()
      render(params)
      await flushSubscription()

      expect(result.realtimeStatus).toBe('offline')
      expect(params.lifecycle.setBackendUnavailableRoadmapId).toHaveBeenCalledWith('rm_1')
      // A transient REST failure must not stop at "offline" - it must
      // still enter the ordinary bounded-backoff reconnect loop rather
      // than requiring something unrelated to clear
      // backendUnavailableRoadmapId before it will ever try again.
      expect(mockedGetEventTicket).not.toHaveBeenCalled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })

      expect(mockedGetEventTicket).toHaveBeenCalledTimes(1)
      act(() => handlers.onOpen?.())
      await flushSubscription()

      expect(result.realtimeStatus).toBe('live')
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers automatically from a transient getEventTicket() connection failure', async () => {
    vi.useFakeTimers()
    try {
      mockedGetEventTicket.mockReset()
        .mockRejectedValueOnce(new ApiConnectionError())
        .mockResolvedValueOnce({ expires_in: 30 })

      const { params } = createParams()
      render(params)
      await flushSubscription()

      expect(result.realtimeStatus).toBe('offline')
      expect(params.lifecycle.setBackendUnavailableRoadmapId).toHaveBeenCalledWith('rm_1')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })

      expect(mockedGetEventTicket).toHaveBeenCalledTimes(2)
      act(() => handlers.onOpen?.())
      await flushSubscription()

      expect(result.realtimeStatus).toBe('live')
    } finally {
      vi.useRealTimers()
    }
  })

  it('caps backoff and never runs two retry timers for repeated connection failures', async () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      mockedGetEventTicket.mockReset().mockRejectedValue(new ApiConnectionError())

      const { params } = createParams()
      render(params)
      await flushSubscription()
      expect(result.realtimeStatus).toBe('offline')
      expect(mockedGetEventTicket).toHaveBeenCalledTimes(1)

      // Math.random mocked to 0 makes each backoff delay exactly its floor
      // (ceiling/2): attempt 0 -> 500ms, attempt 1 -> 1000ms, doubling up to
      // the 30s ceiling (attempt 5+), where it caps at a 15s floor. Checking
      // the instant *before* and *at* each boundary proves both that the
      // delay actually grows and caps as expected, and that exactly one
      // retry timer is ever alive - if a second one were running
      // concurrently, some boundary would fire an extra (or an early) call.
      const floors = [500, 1000, 2000, 4000, 8000, 15000, 15000, 15000]
      for (const [index, floor] of floors.entries()) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(floor - 1)
        })
        expect(mockedGetEventTicket).toHaveBeenCalledTimes(index + 1)

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1)
        })
        expect(mockedGetEventTicket).toHaveBeenCalledTimes(index + 2)
      }
    } finally {
      randomSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('accelerates a pending retry after a connection failure when back online', async () => {
    vi.useFakeTimers()
    try {
      mockedGetEventTicket.mockReset()
        .mockRejectedValueOnce(new ApiConnectionError())
        .mockResolvedValueOnce({ expires_in: 30 })

      const { params } = createParams()
      render(params)
      await flushSubscription()
      expect(result.realtimeStatus).toBe('offline')

      const ticketCallsBeforeOnline = mockedGetEventTicket.mock.calls.length
      await act(async () => {
        window.dispatchEvent(new Event('online'))
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(mockedGetEventTicket.mock.calls.length).toBe(ticketCallsBeforeOnline + 1)
      // No duplicate concurrent attempt: advancing the full backoff window
      // afterward must not add yet another call on top of the accelerated one.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(mockedGetEventTicket.mock.calls.length).toBe(ticketCallsBeforeOnline + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops retrying and clears credentials on a permanent auth error from getLocks()', async () => {
    vi.useFakeTimers()
    try {
      mockedGetLocks.mockReset().mockRejectedValueOnce(new ApiError(403, 'Insufficient permissions'))

      const { params } = createParams()
      render(params)
      await flushSubscription()

      expect(result.realtimeStatus).toBe('access-lost')
      expect(result.accessRevokedEvent).toBe('revoked')
      expect(params.sessionState.setSessionTokenState).toHaveBeenCalledWith(null)
      expect(params.sessionState.setParticipantIdState).toHaveBeenCalledWith(null)

      const ticketCallsAfter = mockedGetEventTicket.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })
      expect(mockedGetEventTicket).toHaveBeenCalledTimes(ticketCallsAfter)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a failed post-reconnect resync truthful and preserves the local draft', async () => {
    const { params, savedRef } = createParams()
    savedRef.current = false
    render(params)
    await flushSubscription()

    mockedGetRoadmap.mockRejectedValueOnce(new Error('network blip'))
    act(() => handlers.onOpen?.())
    expect(result.realtimeStatus).toBe('updating')

    await flushSubscription()

    // Failed refetch must not be falsely reported as live.
    expect(result.realtimeStatus).toBe('reconnecting')
    expect(params.roadmapState.setPhasesState).not.toHaveBeenCalled()
  })

  it('cancels any pending retry timer and the subscription on unmount', async () => {
    vi.useFakeTimers()
    try {
      const { params } = createParams()
      render(params)
      await flushSubscription()

      act(() => handlers.onError?.(new Event('error')))
      expect(result.realtimeStatus).toBe('reconnecting')

      act(() => root.unmount())
      expect(unsubscribe).toHaveBeenCalled()

      const ticketCallsAfterUnmount = mockedGetEventTicket.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })
      // No reconnect fires after unmount even though a retry was pending.
      expect(mockedGetEventTicket).toHaveBeenCalledTimes(ticketCallsAfterUnmount)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores own updates and preserves an unsaved local draft', async () => {
    const { params, savedRef } = createParams()
    render(params)
    await flushSubscription()

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: loadedRoadmap.updatedAt!,
      participant_id: 'pt_self',
    }))
    savedRef.current = false
    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: loadedRoadmap.updatedAt!,
      participant_id: 'pt_other',
    }))

    expect(mockedGetRoadmap).not.toHaveBeenCalled()
    expect(params.roadmapState.setPhasesState).not.toHaveBeenCalled()
  })

  it('applies another participant update and lock events when local state is saved', async () => {
    const { params } = createParams()
    render(params)
    await flushSubscription()

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: loadedRoadmap.updatedAt!,
      participant_id: 'pt_other',
    }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockedGetRoadmap).toHaveBeenCalledWith('rm_1', 'session-token', { signal: expect.any(AbortSignal) })
    expect(params.roadmapState.setRoadmapNameState).toHaveBeenCalledWith('Server roadmap')
    expect(params.roadmapState.setPhasesState).toHaveBeenCalledWith([phase])
    expect(params.roadmapState.setTagRegistryState).toHaveBeenCalledWith([
      { id: 'planning', label: 'Planning' },
    ])

    act(() => handlers.onLockAcquired?.({
      roadmap_id: 'rm_1',
      target: 'phase:phase-1',
      participant_id: 'pt_other',
      display_name: 'Sam',
    }))
    const acquireUpdater = vi.mocked(params.lockState.setLocks).mock.calls.at(-1)?.[0]
    expect(typeof acquireUpdater).toBe('function')
    expect((acquireUpdater as (locks: LockMap) => LockMap)({})).toEqual({
      'phase:phase-1': { participantId: 'pt_other', displayName: 'Sam' },
    })

    act(() => handlers.onLockReleased?.({
      roadmap_id: 'rm_1',
      target: 'phase:phase-1',
      participant_id: 'pt_other',
    }))
    const releaseUpdater = vi.mocked(params.lockState.setLocks).mock.calls.at(-1)?.[0]
    expect((releaseUpdater as (locks: LockMap) => LockMap)({
      'phase:phase-1': { participantId: 'pt_other', displayName: 'Sam' },
    })).toEqual({})
  })

  it('reconnects automatically after an update-triggered authoritative refresh fails, with no further event needed', async () => {
    vi.useFakeTimers()
    try {
      const { params } = createParams()
      render(params)
      await flushSubscription()
      // Reach `live` first - the post-open resync clears the `connecting`
      // guard, which a reconnect triggered below depends on.
      act(() => handlers.onOpen?.())
      await flushSubscription()
      expect(result.realtimeStatus).toBe('live')

      mockedGetRoadmap.mockReset().mockRejectedValueOnce(new ApiConnectionError())
      act(() => handlers.onUpdated?.({
        roadmap_id: 'rm_1',
        updated_at: loadedRoadmap.updatedAt!,
        participant_id: 'pt_other',
      }))
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      // A plain update-triggered refetch failure now recovers the same way
      // a post-open resync failure does: close this attempt and schedule a
      // reconnect, instead of merely reporting status and waiting for
      // another server event or user interaction that may never come.
      expect(result.realtimeStatus).toBe('offline')
      expect(unsubscribe).toHaveBeenCalled()

      mockedGetEventTicket.mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(mockedGetEventTicket).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts a superseded attempt\'s in-flight authoritative GET instead of leaving it to resolve later', async () => {
    vi.useFakeTimers()
    try {
      const { params } = createParams()
      render(params)
      await flushSubscription()

      let capturedSignal: AbortSignal | undefined
      mockedGetRoadmap.mockReset().mockImplementationOnce((_id, _token, options) => {
        capturedSignal = (options as { signal?: AbortSignal } | undefined)?.signal
        return new Promise<Roadmap>((_resolve, reject) => {
          capturedSignal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      })
      act(() => handlers.onOpen?.())
      expect(result.realtimeStatus).toBe('updating')
      expect(capturedSignal?.aborted).toBe(false)

      // Generation 1's EventSource errors; closing generation 1's attempt
      // must abort its still-pending authoritative GET immediately rather
      // than leaving it to hang until it eventually settles on its own.
      act(() => handlers.onError?.(new Event('error')))
      expect(capturedSignal?.aborted).toBe(true)
      expect(result.realtimeStatus).toBe('reconnecting')

      // Letting the now-aborted request's rejection actually propagate must
      // not change status again, apply any data, or schedule a second
      // retry - the attempt was already closed and is no longer current.
      const statusAfterClose = result.realtimeStatus
      mockedGetEventTicket.mockClear()
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(result.realtimeStatus).toBe(statusAfterClose)
      expect(params.roadmapState.setPhasesState).not.toHaveBeenCalled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(mockedGetEventTicket).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers when the current attempt\'s authoritative GET exceeds its bounded timeout', async () => {
    vi.useFakeTimers()
    try {
      const { params } = createParams()
      render(params)
      await flushSubscription()

      mockedGetRoadmap.mockReset().mockImplementationOnce((_id, _token, options) => {
        const signal = (options as { signal?: AbortSignal } | undefined)?.signal
        return new Promise<Roadmap>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      })
      act(() => handlers.onOpen?.())
      expect(result.realtimeStatus).toBe('updating')

      // A network black hole or hung server must not block recovery
      // forever - the bounded 15s authoritative-refresh timeout aborts the
      // request itself (distinct from a definitive 401/expired rejection)
      // and this, like any other transient failure, closes the attempt and
      // schedules a reconnect.
      mockedGetEventTicket.mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000)
      })
      expect(result.realtimeStatus).toBe('reconnecting')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(mockedGetEventTicket).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the authoritative-refresh timeout and any pending retry on unmount', async () => {
    vi.useFakeTimers()
    try {
      const { params } = createParams()
      render(params)
      await flushSubscription()

      let capturedSignal: AbortSignal | undefined
      mockedGetRoadmap.mockReset().mockImplementationOnce((_id, _token, options) => {
        capturedSignal = (options as { signal?: AbortSignal } | undefined)?.signal
        return new Promise<Roadmap>(() => {})
      })
      act(() => handlers.onOpen?.())
      expect(result.realtimeStatus).toBe('updating')

      act(() => root.unmount())
      expect(capturedSignal?.aborted).toBe(true)

      const setPhases = vi.mocked(params.roadmapState.setPhasesState)
      setPhases.mockClear()
      mockedGetEventTicket.mockClear()
      // Advances well past both the 15s authoritative-refresh timeout and
      // the reconnect backoff cap - neither may fire anything post-unmount.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })
      expect(setPhases).not.toHaveBeenCalled()
      expect(mockedGetEventTicket).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears revoked authority while retaining a dirty local cache', async () => {
    const { params } = createParams()
    storage.setActiveRoadmapId('local_1')
    storage.setAuthCache('local_1', {
      serverRoadmapId: 'rm_1',
      sessionToken: 'session-token',
      participantId: 'pt_self',
      role: 'editor',
    })
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Local draft',
      phases: [phase],
      saved: true,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-07-25T18:00:00Z',
      isPasswordEnabled: false,
    })
    render(params)
    await flushSubscription()

    act(() => handlers.onParticipantRevoked?.({
      roadmap_id: 'rm_1',
      participant_id: 'pt_self',
      revoked_at: '2026-07-25T18:05:00Z',
    }))

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(storage.getAuthCache('local_1')).toBeNull()
    expect(storage.getRoadmapCache('local_1')?.saved).toBe(false)
    expect(params.sessionState.setServerRoadmapIdState).toHaveBeenCalledWith(null)
    expect(params.sessionState.setSessionTokenState).toHaveBeenCalledWith(null)
    expect(params.roadmapState.setSavedState).toHaveBeenCalledWith(false)
    expect(result.accessRevokedEvent).toBe('revoked')
  })

  it('does not let a resync outlived by revocation restore access', async () => {
    const { params } = createParams()
    render(params)
    await flushSubscription()

    const deferred = createDeferred<Roadmap>()
    mockedGetRoadmap.mockReset().mockImplementationOnce(() => deferred.promise)

    act(() => handlers.onOpen?.())
    expect(result.realtimeStatus).toBe('updating')

    act(() => handlers.onParticipantRevoked?.({
      roadmap_id: 'rm_1',
      participant_id: 'pt_self',
      revoked_at: '2026-07-25T18:05:00Z',
    }))
    expect(result.realtimeStatus).toBe('access-lost')

    deferred.resolve(loadedRoadmap)
    await flushSubscription()

    expect(result.realtimeStatus).toBe('access-lost')
    expect(params.roadmapState.setPhasesState).not.toHaveBeenCalled()
    expect(params.sessionState.setSessionTokenState).toHaveBeenCalledWith(null)
  })

  it('does not restart a retry loop when a stale resync resolves after revocation', async () => {
    vi.useFakeTimers()
    try {
      const { params } = createParams()
      render(params)
      await flushSubscription()

      const deferred = createDeferred<Roadmap>()
      mockedGetRoadmap.mockReset().mockImplementationOnce(() => deferred.promise)

      act(() => handlers.onOpen?.())
      act(() => handlers.onParticipantRevoked?.({
        roadmap_id: 'rm_1',
        participant_id: 'pt_self',
        revoked_at: '2026-07-25T18:05:00Z',
      }))

      const ticketCallsAfterRevoke = mockedGetEventTicket.mock.calls.length
      await act(async () => {
        deferred.resolve(loadedRoadmap)
        await Promise.resolve()
        await Promise.resolve()
        await vi.advanceTimersByTimeAsync(60_000)
      })

      expect(mockedGetEventTicket).toHaveBeenCalledTimes(ticketCallsAfterRevoke)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not let a resync outlived by an EventSource error restore live', async () => {
    const { params } = createParams()
    render(params)
    await flushSubscription()

    const deferred = createDeferred<Roadmap>()
    mockedGetRoadmap.mockReset().mockImplementationOnce(() => deferred.promise)

    act(() => handlers.onOpen?.())
    expect(result.realtimeStatus).toBe('updating')

    act(() => handlers.onError?.(new Event('error')))
    expect(result.realtimeStatus).toBe('reconnecting')

    deferred.resolve(loadedRoadmap)
    await flushSubscription()

    expect(result.realtimeStatus).toBe('reconnecting')
    expect(params.roadmapState.setPhasesState).not.toHaveBeenCalled()
  })

  it('does not let a stale generation\'s still in-flight resync block a replacement\'s own mandatory resync', async () => {
    vi.useFakeTimers()
    try {
      const { params } = createParams()
      render(params)
      await flushSubscription()

      // Generation 1 opens; its mandatory post-open resync starts and never
      // resolves yet.
      const gen1Deferred = createDeferred<Roadmap>()
      mockedGetRoadmap.mockReset().mockImplementationOnce(() => gen1Deferred.promise)
      act(() => handlers.onOpen?.())
      expect(result.realtimeStatus).toBe('updating')

      // Generation 1's EventSource errors; a reconnect is scheduled. This
      // closes generation 1's attempt (aborting its refresh controller) but
      // the mocked getRoadmap ignores the abort signal, so gen1Deferred is
      // still the pending resolution generation 1's own (now-stale) request
      // is waiting on.
      act(() => handlers.onError?.(new Event('error')))
      expect(result.realtimeStatus).toBe('reconnecting')

      // Generation 2 connects: a fresh ticket, a new EventSource, and a new
      // handler set (`handlers` is reassigned by the subscribe mock).
      const gen2Roadmap: Roadmap = {
        ...loadedRoadmap,
        roadmap: { ...loadedRoadmap.roadmap, name: 'Gen 2 roadmap' },
      }
      const gen2Deferred = createDeferred<Roadmap>()
      mockedGetRoadmap.mockImplementationOnce(() => gen2Deferred.promise)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })

      // Generation 2 requests its own mandatory resync. Refresh state now
      // lives per-attempt, so generation 1's still-in-flight (stale) request
      // must never block or coalesce generation 2's own - it fires its own
      // GET immediately instead of waiting for generation 1's to settle.
      act(() => handlers.onOpen?.())
      expect(mockedGetRoadmap).toHaveBeenCalledTimes(2)
      expect(result.realtimeStatus).toBe('updating')

      // Generation 1's stale resync resolves now - it must be ignored,
      // since generation 2 is current.
      await act(async () => {
        gen1Deferred.resolve(loadedRoadmap)
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(params.roadmapState.setRoadmapNameState).not.toHaveBeenCalled()
      expect(result.realtimeStatus).toBe('updating')

      // Generation 2's own resync resolving is what actually applies state
      // and reports live.
      await act(async () => {
        gen2Deferred.resolve(gen2Roadmap)
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(params.roadmapState.setRoadmapNameState).toHaveBeenLastCalledWith('Gen 2 roadmap')
      expect(result.realtimeStatus).toBe('live')
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies no state after unmounting during an in-flight resync', async () => {
    const { params } = createParams()
    render(params)
    await flushSubscription()

    const deferred = createDeferred<Roadmap>()
    mockedGetRoadmap.mockReset().mockImplementationOnce(() => deferred.promise)

    act(() => handlers.onOpen?.())
    act(() => root.unmount())

    deferred.resolve(loadedRoadmap)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(params.roadmapState.setPhasesState).not.toHaveBeenCalled()
  })

  it('coalesces overlapping update refreshes instead of racing two in-flight requests', async () => {
    const { params } = createParams()
    render(params)
    await flushSubscription()

    const firstDeferred = createDeferred<Roadmap>()
    const secondRoadmap: Roadmap = {
      ...loadedRoadmap,
      roadmap: { ...loadedRoadmap.roadmap, name: 'Second revision' },
    }
    mockedGetRoadmap.mockReset()
      .mockImplementationOnce(() => firstDeferred.promise)
      .mockResolvedValueOnce(secondRoadmap)

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1', updated_at: 'a', participant_id: 'pt_other',
    }))
    // A second update event arrives while the first authoritative GET for
    // this roadmap is still in flight - it must not fire its own
    // overlapping request.
    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1', updated_at: 'b', participant_id: 'pt_other',
    }))
    expect(mockedGetRoadmap).toHaveBeenCalledTimes(1)

    firstDeferred.resolve(loadedRoadmap)
    await flushSubscription()

    // The coalesced follow-up request fires automatically once the first
    // completes, and its result - the newer one - is what's applied.
    expect(mockedGetRoadmap).toHaveBeenCalledTimes(2)
    expect(params.roadmapState.setRoadmapNameState).toHaveBeenLastCalledWith('Second revision')
  })

  it('does not affect the new roadmap when the active roadmap changes mid-fetch', async () => {
    const { params } = createParams()
    render(params)
    await flushSubscription()

    const deferred = createDeferred<Awaited<ReturnType<typeof getLocks>>>()
    mockedGetLocks.mockReset().mockImplementationOnce(() => deferred.promise)
    vi.mocked(params.lockState.setLocks).mockClear()

    const nextParams = {
      ...params,
      connection: { ...params.connection, serverRoadmapId: 'rm_2', activeRoadmapId: 'local_2' },
    } satisfies UseRoadmapRealtimeParams

    act(() => {
      root.render(
        <Harness params={nextParams} onResult={() => {}} />,
      )
    })

    deferred.resolve([{
      roadmap_id: 'rm_1',
      target: 'task:tk_1',
      participant_id: 'pt_other',
      display_name: 'Sam',
      expires_at: '2026-07-25T18:00:00Z',
    }])
    await flushSubscription()

    // The old roadmap's stale lock fetch must not populate state for the
    // new roadmap the effect has since moved on to.
    expect(params.lockState.setLocks).toHaveBeenCalledTimes(1)
    expect(mockedGetEventTicket).toHaveBeenCalledWith('rm_2', 'session-token')
  })

  describe('stale callback isolation across connection attempts', () => {
    // Establishes two connection generations with separate handler sets and
    // separate unsubscribe mocks: generation 1 opens, then errors and is
    // replaced by generation 2 (which also opens and completes its
    // mandatory resync, reaching `live`) - mirroring what an old EventSource
    // callback firing after a reconnect would see in production.
    async function setUpTwoLiveGenerations() {
      const calls = captureSubscriptions()
      mockedGetEventTicket.mockReset()
        .mockResolvedValueOnce({ expires_in: 30 })
        .mockResolvedValueOnce({ expires_in: 30 })

      const { params } = createParams()
      render(params)
      await flushSubscription()

      act(() => calls[0].handlers.onError?.(new Event('error')))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      act(() => calls[1].handlers.onOpen?.())
      await flushSubscription()

      expect(result.realtimeStatus).toBe('live')
      expect(calls).toHaveLength(2)
      return { calls, params }
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('does not let a stale onLockAcquired mutate the replacement connection\'s locks', async () => {
      const { calls, params } = await setUpTwoLiveGenerations()
      vi.mocked(params.lockState.setLocks).mockClear()

      act(() => calls[0].handlers.onLockAcquired?.({
        roadmap_id: 'rm_1', target: 'task:tk_stale', participant_id: 'pt_x', display_name: 'Stale',
      }))
      expect(params.lockState.setLocks).not.toHaveBeenCalled()

      act(() => calls[1].handlers.onLockAcquired?.({
        roadmap_id: 'rm_1', target: 'task:tk_fresh', participant_id: 'pt_y', display_name: 'Fresh',
      }))
      expect(params.lockState.setLocks).toHaveBeenCalledTimes(1)
    })

    it('does not let a stale onLockReleased remove a current lock', async () => {
      const { calls, params } = await setUpTwoLiveGenerations()
      vi.mocked(params.lockState.setLocks).mockClear()

      act(() => calls[0].handlers.onLockReleased?.({
        roadmap_id: 'rm_1', target: 'task:tk_1', participant_id: 'pt_other',
      }))
      expect(params.lockState.setLocks).not.toHaveBeenCalled()
    })

    it('does not let a stale onParticipantRevoked clear the replacement session', async () => {
      const { calls, params } = await setUpTwoLiveGenerations()

      act(() => calls[0].handlers.onParticipantRevoked?.({
        roadmap_id: 'rm_1', participant_id: 'pt_self', revoked_at: '2026-07-25T18:05:00Z',
      }))

      expect(result.realtimeStatus).toBe('live')
      expect(params.sessionState.setSessionTokenState).not.toHaveBeenCalledWith(null)
    })

    it('does not let a stale onRoadmapDeleted remove current access', async () => {
      const { calls, params } = await setUpTwoLiveGenerations()

      act(() => calls[0].handlers.onRoadmapDeleted?.({
        roadmap_id: 'rm_1', updated_at: '2026-07-25T18:05:00Z', participant_id: 'pt_other',
      }))

      expect(result.realtimeStatus).toBe('live')
      expect(params.sessionState.setServerRoadmapIdState).not.toHaveBeenCalledWith(null)
    })

    it('does not let a stale onError close the replacement EventSource or schedule another retry', async () => {
      const { calls } = await setUpTwoLiveGenerations()
      const ticketCallsBefore = mockedGetEventTicket.mock.calls.length

      act(() => calls[0].handlers.onError?.(new Event('error')))

      expect(calls[1].unsubscribe).not.toHaveBeenCalled()
      expect(result.realtimeStatus).toBe('live')

      // No duplicate retry was scheduled on the replacement's behalf either.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(mockedGetEventTicket.mock.calls.length).toBe(ticketCallsBefore)
    })

    it('does not let a stale onOpen start a resync that could restore live', async () => {
      const calls = captureSubscriptions()
      mockedGetEventTicket.mockReset()
        .mockResolvedValueOnce({ expires_in: 30 })
        .mockResolvedValueOnce({ expires_in: 30 })

      const { params } = createParams()
      render(params)
      await flushSubscription()

      // Generation 1 never got to open (no onOpen fired for it yet), then
      // errors and generation 2 takes over and reaches `live`.
      act(() => calls[0].handlers.onError?.(new Event('error')))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      act(() => calls[1].handlers.onOpen?.())
      await flushSubscription()
      expect(result.realtimeStatus).toBe('live')

      vi.mocked(params.roadmapState.setPhasesState).mockClear()
      const getRoadmapCallsBefore = mockedGetRoadmap.mock.calls.length

      // Generation 1's onOpen fires late (a stale callback) - must not
      // start a new resync or otherwise disturb the already-live replacement.
      act(() => calls[0].handlers.onOpen?.())

      expect(mockedGetRoadmap.mock.calls.length).toBe(getRoadmapCallsBefore)
      expect(result.realtimeStatus).toBe('live')
    })

    it('does nothing for any callback firing after unmount', async () => {
      const { calls, params } = await setUpTwoLiveGenerations()
      act(() => root.unmount())
      // Cleanup itself closes the live (generation 2) EventSource exactly
      // once - that's expected. What must not happen is anything further.
      expect(calls[1].unsubscribe).toHaveBeenCalledTimes(1)

      vi.mocked(params.lockState.setLocks).mockClear()
      vi.mocked(params.sessionState.setSessionTokenState).mockClear()

      calls[1].handlers.onLockAcquired?.({
        roadmap_id: 'rm_1', target: 'task:tk_x', participant_id: 'pt_x', display_name: 'X',
      })
      calls[1].handlers.onParticipantRevoked?.({
        roadmap_id: 'rm_1', participant_id: 'pt_self', revoked_at: '2026-07-25T18:05:00Z',
      })
      calls[1].handlers.onError?.(new Event('error'))

      expect(params.lockState.setLocks).not.toHaveBeenCalled()
      expect(params.sessionState.setSessionTokenState).not.toHaveBeenCalled()
      expect(calls[1].unsubscribe).toHaveBeenCalledTimes(1)
    })
  })
})
