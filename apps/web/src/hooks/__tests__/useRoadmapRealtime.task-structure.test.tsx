// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRoadmapRealtime, type UseRoadmapRealtimeParams } from '@/hooks/useRoadmapRealtime'
import { storage } from '@/lib/storage'
import { getRoadmap } from '@/services/roadmap-crud.service'
import { getLocks } from '@/services/roadmap-locks.service'
import {
  getEventTicket,
  subscribeToRoadmapEvents,
  type RealtimeHandlers,
} from '@/services/roadmap-realtime.service'
import type { Phase, Roadmap } from '@/types/roadmap'

vi.mock('@/services/roadmap-crud.service', () => ({ getRoadmap: vi.fn() }))
vi.mock('@/services/roadmap-locks.service', () => ({ getLocks: vi.fn() }))
vi.mock('@/services/roadmap-realtime.service', () => ({
  getEventTicket: vi.fn(),
  subscribeToRoadmapEvents: vi.fn(),
}))

const mockedGetRoadmap = vi.mocked(getRoadmap)
const mockedGetLocks = vi.mocked(getLocks)
const mockedGetEventTicket = vi.mocked(getEventTicket)
const mockedSubscribe = vi.mocked(subscribeToRoadmapEvents)

const localPhase: Phase = {
  id: 'phase-a',
  num: '01',
  name: 'Alpha',
  color: '#111111',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [
    {
      id: 'remote-delete',
      title: 'Delete me',
      done: false,
      deps: [],
    },
    {
      id: 'local-dirty',
      title: 'Unsaved local title',
      done: false,
      deps: ['remote-delete'],
      desc: 'keep this draft',
    },
  ],
}

const serverRoadmap: Roadmap = {
  project: { id: 'rm_1', name: 'Server roadmap' },
  roadmap: { id: 'rm_1', name: 'Server roadmap', isPasswordEnabled: false },
  phases: [{
    ...localPhase,
    tasks: [{
      ...localPhase.tasks[1],
      title: 'Stale server title',
      desc: 'stale server description',
      deps: [],
    }],
  }],
  tagRegistry: [],
  ownerDisplayName: 'Owner',
  updatedAt: '2026-08-18T09:30:00Z',
}

function Harness({ params }: { params: UseRoadmapRealtimeParams }) {
  useRoadmapRealtime(params)
  return null
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useRoadmapRealtime task structure events', () => {
  let container: HTMLDivElement
  let root: Root
  let handlers: RealtimeHandlers

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    handlers = {}
    mockedGetRoadmap.mockReset().mockResolvedValue(serverRoadmap)
    mockedGetLocks.mockReset().mockResolvedValue([])
    mockedGetEventTicket.mockReset().mockResolvedValue({ expires_in: 30 })
    mockedSubscribe.mockReset().mockImplementation((_roadmapId, nextHandlers) => {
      handlers = nextHandlers
      return vi.fn()
    })

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Local draft',
      phases: [localPhase],
      saved: false,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-08-18T09:00:00Z',
      isPasswordEnabled: false,
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('rebases a remote task subtree deletion onto an unrelated dirty local draft', async () => {
    const setPhasesState = vi.fn()
    const params = {
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
        savedRef: { current: false },
        showUpgradeNoticeOnce: vi.fn(),
        setBackendUnavailableRoadmapId: vi.fn(),
      },
      roadmapState: {
        setRoadmapNameState: vi.fn(),
        setPhasesState,
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
      lockState: { setLocks: vi.fn() },
    } satisfies UseRoadmapRealtimeParams

    act(() => root.render(<Harness params={params} />))
    await flush()

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: serverRoadmap.updatedAt!,
      participant_id: 'pt_other',
      task_id: 'remote-delete',
      task_ids: ['remote-delete'],
      task_operation: 'deleted',
      phase_id: 'phase-a',
    }))
    await flush()

    expect(mockedGetRoadmap).toHaveBeenCalledWith(
      'rm_1',
      'session-token',
      { signal: expect.any(AbortSignal) },
    )
    const cached = storage.getRoadmapCache('local_1')
    expect(cached?.phases[0].tasks.map((task) => task.id)).toEqual(['local-dirty'])
    expect(cached?.phases[0].tasks[0]).toEqual(expect.objectContaining({
      title: 'Unsaved local title',
      desc: 'keep this draft',
      deps: [],
    }))
    expect(setPhasesState).toHaveBeenCalledWith(cached?.phases)
  })
})
