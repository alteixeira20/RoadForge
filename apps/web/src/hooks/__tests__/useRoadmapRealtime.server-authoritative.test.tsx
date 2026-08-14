// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useRoadmapRealtime,
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

const localPhase: Phase = {
  id: 'phase-1',
  num: '01',
  name: 'Locally renamed phase',
  color: '#76746e',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [
    {
      id: 'task-1',
      title: 'Shared task',
      done: false,
      complexity: 'medium',
      tags: [],
      deps: [],
    },
    {
      id: 'task-local',
      title: 'Unsaved local task',
      done: false,
      complexity: 'medium',
      tags: ['local-only'],
      deps: [],
    },
  ],
}

const authoritativeRoadmap: Roadmap = {
  project: { id: 'rm_1', name: 'Server roadmap' },
  roadmap: { id: 'rm_1', name: 'Server roadmap', isPasswordEnabled: false },
  phases: [{
    ...localPhase,
    name: 'Server phase name',
    progress: 100,
    tasks: [{
      ...localPhase.tasks[0],
      done: true,
      claimedBy: 'Sam',
      claimedById: 'pt_sam',
      claimedAt: '2026-08-14T08:00:00Z',
    }],
  }],
  tagRegistry: [],
  ownerDisplayName: 'Owner',
  updatedAt: '2026-08-14T08:00:00Z',
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

async function flushSubscription() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useRoadmapRealtime server-authoritative task updates', () => {
  let container: HTMLDivElement
  let root: Root
  let handlers: RealtimeHandlers

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    handlers = {}
    mockedGetRoadmap.mockReset().mockResolvedValue(authoritativeRoadmap)
    mockedGetLocks.mockReset().mockResolvedValue([])
    mockedGetEventTicket.mockReset().mockResolvedValue({ expires_in: 30 })
    mockedSubscribe.mockReset().mockImplementation((_id, nextHandlers) => {
      handlers = nextHandlers
      return vi.fn()
    })

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Unsaved local roadmap name',
      phases: [localPhase],
      saved: false,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-08-14T07:59:00Z',
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

  it('applies a teammate task completion immediately while preserving unrelated local edits', async () => {
    const savedRef = { current: false }
    const params: UseRoadmapRealtimeParams = {
      connection: {
        serverRoadmapId: 'rm_1',
        sessionToken: 'session-token',
        participantId: 'pt_self',
        role: 'editor',
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
    }

    let result!: UseRoadmapRealtimeReturn
    act(() => {
      root.render(
        <Harness params={params} onResult={(next) => { result = next }} />,
      )
    })
    await flushSubscription()

    // Initial post-open refresh is full-roadmap scoped. Because this browser
    // has an unsaved draft, that refresh must keep preserving the draft.
    act(() => handlers.onOpen?.())
    await flushSubscription()
    expect(result.realtimeStatus).toBe('live')
    vi.mocked(params.roadmapState.setPhasesState).mockClear()
    vi.mocked(params.roadmapState.setRoadmapNameState).mockClear()
    mockedGetRoadmap.mockClear()

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: authoritativeRoadmap.updatedAt!,
      participant_id: 'pt_sam',
      task_id: 'task-1',
      action: 'task.completed',
    }))
    await flushSubscription()

    expect(mockedGetRoadmap).toHaveBeenCalledTimes(1)
    expect(params.roadmapState.setRoadmapNameState).not.toHaveBeenCalled()
    expect(params.metadataState.setUpdatedAtState).toHaveBeenCalledWith(
      authoritativeRoadmap.updatedAt,
    )
    expect(params.roadmapState.setPhasesState).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'phase-1',
        name: 'Locally renamed phase',
        progress: 50,
        tasks: [
          expect.objectContaining({
            id: 'task-1',
            done: true,
            claimedBy: 'Sam',
          }),
          expect.objectContaining({
            id: 'task-local',
            title: 'Unsaved local task',
          }),
        ],
      }),
    ])

    const cached = storage.getRoadmapCache('local_1')
    expect(cached?.roadmapName).toBe('Unsaved local roadmap name')
    expect(cached?.saved).toBe(false)
    expect(cached?.updatedAt).toBe(authoritativeRoadmap.updatedAt)
    expect(cached?.phases[0].progress).toBe(50)
    expect(cached?.phases[0].tasks[0].done).toBe(true)
    expect(cached?.phases[0].tasks[1].title).toBe('Unsaved local task')
  })
})
