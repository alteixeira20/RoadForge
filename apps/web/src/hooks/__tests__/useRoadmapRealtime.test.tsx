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
      ticket: 'event-ticket',
      expires_in: 30,
    })
    mockedSubscribe.mockReset().mockImplementation((_id, _ticket, nextHandlers) => {
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

  it('hydrates locks and moves from connecting to live', async () => {
    const { params } = createParams()
    render(params)
    await flushSubscription()

    expect(params.lockState.setLocks).toHaveBeenCalledWith({
      'task:tk_1': { participantId: 'pt_other', displayName: 'Sam' },
    })
    expect(mockedSubscribe).toHaveBeenCalledWith(
      'rm_1',
      'event-ticket',
      expect.any(Object),
    )
    act(() => handlers.onOpen?.())
    expect(result.realtimeStatus).toBe('live')
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

    expect(mockedGetRoadmap).toHaveBeenCalledWith('rm_1', 'session-token')
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
})
