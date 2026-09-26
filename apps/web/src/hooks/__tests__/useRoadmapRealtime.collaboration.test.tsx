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

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
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

function setupTestEnvironment(initialSaved = true) {
  const savedRef = { current: initialSaved }
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
  return { params, savedRef }
}

describe('useRoadmapRealtime seamless collaborative editing', () => {
  let container: HTMLDivElement
  let root: Root
  let handlers: RealtimeHandlers
  let unsubscribeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    handlers = {}
    unsubscribeMock = vi.fn()
    mockedGetRoadmap.mockReset().mockResolvedValue({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
    })
    mockedGetLocks.mockReset().mockResolvedValue([])
    mockedGetEventTicket.mockReset().mockResolvedValue({ expires_in: 30 })
    mockedSubscribe.mockReset().mockImplementation((_id, nextHandlers) => {
      handlers = nextHandlers
      return unsubscribeMock
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('1. handles two clients editing unrelated tasks concurrently without overwriting local draft', async () => {
    const { params } = setupTestEnvironment(false)
    const localPhase: Phase = {
      id: 'phase-1',
      num: '01',
      name: 'Phase 1',
      color: '#76746e',
      status: 'active',
      progress: 0,
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1 local draft title',
          desc: 'Task 1 local unsaved description',
          done: false,
        },
        {
          id: 'task-2',
          title: 'Task 2 initial title',
          desc: 'Task 2 initial description',
          done: false,
        },
      ],
    }

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Test Roadmap',
      phases: [localPhase],
      saved: false,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
      isPasswordEnabled: false,
    })

    let result!: UseRoadmapRealtimeReturn
    act(() => {
      root.render(
        <Harness params={params} onResult={(next) => { result = next }} />,
      )
    })
    await flushAsync()

    act(() => handlers.onOpen?.())
    await flushAsync()
    expect(result.realtimeStatus).toBe('live')

    // Remote collaborator edits task-2 only
    const serverPhases: Phase[] = [
      {
        ...localPhase,
        tasks: [
          {
            id: 'task-1',
            title: 'Task 1 original server title',
            desc: 'Task 1 original server description',
            done: false,
          },
          {
            id: 'task-2',
            title: 'Task 2 remote edit by collaborator',
            desc: 'Task 2 initial description',
            done: false,
          },
        ],
      },
    ]

    mockedGetRoadmap.mockResolvedValueOnce({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: serverPhases,
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:01:00Z',
    })

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-09-01T10:01:00Z',
      participant_id: 'pt_collaborator',
      task_id: 'task-2',
      action: 'task.updated',
      changed_fields: ['title'],
    }))
    await flushAsync()

    // Status remains live (routine update does not flicker to updating)
    expect(result.realtimeStatus).toBe('live')

    const phaseCalls = vi.mocked(params.roadmapState.setPhasesState).mock.calls
    expect(phaseCalls.length).toBeGreaterThan(0)
    const updatedPhases = phaseCalls[phaseCalls.length - 1][0] as Phase[]

    // Task 1 local draft is preserved
    expect(updatedPhases[0].tasks[0].title).toBe('Task 1 local draft title')
    expect(updatedPhases[0].tasks[0].desc).toBe('Task 1 local unsaved description')

    // Task 2 remote update is applied
    expect(updatedPhases[0].tasks[1].title).toBe('Task 2 remote edit by collaborator')

    // Storage cache keeps unsaved draft status
    const cached = storage.getRoadmapCache('local_1')
    expect(cached?.saved).toBe(false)
    expect(cached?.phases[0].tasks[0].title).toBe('Task 1 local draft title')
    expect(cached?.phases[0].tasks[1].title).toBe('Task 2 remote edit by collaborator')
  })

  it('2. handles rapid edits to the same task by coalescing into single in-flight fetch and one follow-up', async () => {
    const { params } = setupTestEnvironment(true)
    const initialPhase: Phase = {
      id: 'phase-1',
      num: '01',
      name: 'Phase 1',
      color: '#76746e',
      status: 'active',
      progress: 0,
      tasks: [{ id: 'task-1', title: 'Initial title', done: false }],
    }

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Test Roadmap',
      phases: [initialPhase],
      saved: true,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
      isPasswordEnabled: false,
    })

    const initialDeferred = createDeferred<Roadmap>()
    mockedGetRoadmap.mockReturnValueOnce(initialDeferred.promise)

    act(() => {
      root.render(<Harness params={params} onResult={() => {}} />)
    })
    await flushAsync()
    act(() => handlers.onOpen?.())

    initialDeferred.resolve({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [initialPhase],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
    })
    await flushAsync()
    mockedGetRoadmap.mockClear()

    const firstInFlight = createDeferred<Roadmap>()
    const secondFollowUp: Roadmap = {
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [{
        ...initialPhase,
        tasks: [{ id: 'task-1', title: 'Final rapid edit title', done: false }],
      }],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:03Z',
    }

    mockedGetRoadmap
      .mockImplementationOnce(() => firstInFlight.promise)
      .mockResolvedValueOnce(secondFollowUp)

    // Trigger rapid incoming events while first GET is in flight
    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-09-01T10:00:01Z',
      participant_id: 'pt_collaborator',
      task_id: 'task-1',
      action: 'task.updated',
      changed_fields: ['title'],
    }))

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-09-01T10:00:02Z',
      participant_id: 'pt_collaborator',
      task_id: 'task-1',
      action: 'task.updated',
      changed_fields: ['title'],
    }))

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-09-01T10:00:03Z',
      participant_id: 'pt_collaborator',
      task_id: 'task-1',
      action: 'task.updated',
      changed_fields: ['title'],
    }))

    // Only 1 GET should be in flight during the burst
    expect(mockedGetRoadmap).toHaveBeenCalledTimes(1)

    // Resolve the first in-flight GET
    firstInFlight.resolve({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [{
        ...initialPhase,
        tasks: [{ id: 'task-1', title: 'First intermediate edit title', done: false }],
      }],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:01Z',
    })
    await flushAsync()

    // Follow-up GET fires automatically for the coalesced burst
    expect(mockedGetRoadmap).toHaveBeenCalledTimes(2)

    const phaseCalls = vi.mocked(params.roadmapState.setPhasesState).mock.calls
    const finalPhases = phaseCalls[phaseCalls.length - 1][0] as Phase[]
    expect(finalPhases[0].tasks[0].title).toBe('Final rapid edit title')
  })

  it('3. applies remote completion while keeping local description draft intact', async () => {
    const { params } = setupTestEnvironment(false)
    const localPhase: Phase = {
      id: 'phase-1',
      num: '01',
      name: 'Phase 1',
      color: '#76746e',
      status: 'active',
      progress: 0,
      tasks: [
        {
          id: 'task-1',
          title: 'Implement authentication',
          desc: 'Unsaved local draft notes and implementation instructions',
          done: false,
        },
      ],
    }

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Test Roadmap',
      phases: [localPhase],
      saved: false,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
      isPasswordEnabled: false,
    })

    mockedGetRoadmap.mockResolvedValueOnce({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [localPhase],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
    })

    act(() => {
      root.render(<Harness params={params} onResult={() => {}} />)
    })
    await flushAsync()
    act(() => handlers.onOpen?.())
    await flushAsync()
    mockedGetRoadmap.mockClear()

    // Remote teammate marks task-1 complete
    mockedGetRoadmap.mockResolvedValueOnce({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [
        {
          ...localPhase,
          progress: 100,
          tasks: [
            {
              id: 'task-1',
              title: 'Implement authentication',
              desc: 'Old server description',
              done: true,
              claimedBy: 'Alice',
              claimedById: 'pt_alice',
              claimedAt: '2026-09-01T10:05:00Z',
            },
          ],
        },
      ],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:05:00Z',
    })

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-09-01T10:05:00Z',
      participant_id: 'pt_alice',
      task_id: 'task-1',
      action: 'task.completed',
    }))
    await flushAsync()

    const phaseCalls = vi.mocked(params.roadmapState.setPhasesState).mock.calls
    const updatedPhases = phaseCalls[phaseCalls.length - 1][0] as Phase[]
    const updatedTask = updatedPhases[0].tasks[0]

    // Completion fields applied
    expect(updatedTask.done).toBe(true)
    expect(updatedTask.claimedBy).toBe('Alice')

    // Local description editor content NOT overwritten
    expect(updatedTask.desc).toBe('Unsaved local draft notes and implementation instructions')

    // Cache updated and saved flag remains false
    const cached = storage.getRoadmapCache('local_1')
    expect(cached?.saved).toBe(false)
    expect(cached?.phases[0].tasks[0].done).toBe(true)
    expect(cached?.phases[0].tasks[0].desc).toBe('Unsaved local draft notes and implementation instructions')
  })

  it('4. rebases remote phase creation and deletion onto local drafts without disturbing unchanged phases', async () => {
    const { params } = setupTestEnvironment(false)
    const phaseA: Phase = {
      id: 'phase-a',
      num: '01',
      name: 'Phase A with draft',
      color: '#76746e',
      status: 'active',
      progress: 0,
      tasks: [{ id: 'task-a', title: 'Local draft task', done: false }],
    }
    const phaseB: Phase = {
      id: 'phase-b',
      num: '02',
      name: 'Phase B',
      color: '#555555',
      status: 'next',
      progress: 0,
      tasks: [],
    }

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Test Roadmap',
      phases: [phaseA, phaseB],
      saved: false,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
      isPasswordEnabled: false,
    })

    mockedGetRoadmap.mockResolvedValueOnce({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [phaseA, phaseB],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
    })

    act(() => {
      root.render(<Harness params={params} onResult={() => {}} />)
    })
    await flushAsync()
    act(() => handlers.onOpen?.())
    await flushAsync()
    mockedGetRoadmap.mockClear()

    // 1. Remote collaborator adds phase-c
    const phaseC: Phase = {
      id: 'phase-c',
      num: '03',
      name: 'Phase C Created Remotely',
      color: '#333333',
      status: 'next',
      progress: 0,
      tasks: [{ id: 'task-c', title: 'Remote task C', done: false }],
    }

    mockedGetRoadmap.mockResolvedValueOnce({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [
        {
          id: 'phase-a',
          num: '01',
          name: 'Server Phase A',
          color: '#76746e',
          status: 'active',
          progress: 0,
          tasks: [{ id: 'task-a', title: 'Server title', done: false }],
        },
        phaseB,
        phaseC,
      ],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:06:00Z',
    })

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-09-01T10:06:00Z',
      participant_id: 'pt_collaborator',
      phase_operation: 'created',
      phase_id: 'phase-c',
    }))
    await flushAsync()

    let phaseCalls = vi.mocked(params.roadmapState.setPhasesState).mock.calls
    let updatedPhases = phaseCalls[phaseCalls.length - 1][0] as Phase[]

    // Phase C added, Phase A local draft preserved
    expect(updatedPhases.map((p) => p.id)).toEqual(['phase-a', 'phase-b', 'phase-c'])
    expect(updatedPhases[0].name).toBe('Phase A with draft')
    expect(updatedPhases[0].tasks[0].title).toBe('Local draft task')
    expect(updatedPhases[2].id).toBe('phase-c')

    // 2. Remote collaborator deletes phase-b
    mockedGetRoadmap.mockResolvedValueOnce({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [
        {
          id: 'phase-a',
          num: '01',
          name: 'Server Phase A',
          color: '#76746e',
          status: 'active',
          progress: 0,
          tasks: [{ id: 'task-a', title: 'Server title', done: false }],
        },
        phaseC,
      ],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:07:00Z',
    })

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-09-01T10:07:00Z',
      participant_id: 'pt_collaborator',
      phase_operation: 'deleted',
      phase_id: 'phase-b',
    }))
    await flushAsync()

    phaseCalls = vi.mocked(params.roadmapState.setPhasesState).mock.calls
    updatedPhases = phaseCalls[phaseCalls.length - 1][0] as Phase[]

    // Phase B deleted, Phase A local draft still preserved
    expect(updatedPhases.map((p) => p.id)).toEqual(['phase-a', 'phase-c'])
    expect(updatedPhases[0].name).toBe('Phase A with draft')
    expect(updatedPhases[0].tasks[0].title).toBe('Local draft task')
    expect(updatedPhases[1].id).toBe('phase-c')
  })

  it('5. reorders tasks during concurrent editing while preserving local drafts', async () => {
    const { params } = setupTestEnvironment(false)
    const task1 = { id: 'task-1', title: 'Task 1 local draft', done: false }
    const task2 = { id: 'task-2', title: 'Task 2 local draft', done: false }
    const task3 = { id: 'task-3', title: 'Task 3 local draft', done: false }

    const localPhase: Phase = {
      id: 'phase-1',
      num: '01',
      name: 'Phase 1',
      color: '#76746e',
      status: 'active',
      progress: 0,
      tasks: [task1, task2, task3],
    }

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Test Roadmap',
      phases: [localPhase],
      saved: false,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
      isPasswordEnabled: false,
    })

    mockedGetRoadmap.mockResolvedValueOnce({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [localPhase],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
    })

    act(() => {
      root.render(<Harness params={params} onResult={() => {}} />)
    })
    await flushAsync()
    act(() => handlers.onOpen?.())
    await flushAsync()
    mockedGetRoadmap.mockClear()

    // Collaborator reordered tasks to: task-3, task-1, task-2
    mockedGetRoadmap.mockResolvedValueOnce({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [{
        ...localPhase,
        tasks: [
          { id: 'task-3', title: 'Server task 3', done: false },
          { id: 'task-1', title: 'Server task 1', done: false },
          { id: 'task-2', title: 'Server task 2', done: false },
        ],
      }],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:07:00Z',
    })

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-09-01T10:07:00Z',
      participant_id: 'pt_collaborator',
      phase_id: 'phase-1',
      task_operation: 'reordered',
    }))
    await flushAsync()

    const phaseCalls = vi.mocked(params.roadmapState.setPhasesState).mock.calls
    const updatedPhases = phaseCalls[phaseCalls.length - 1][0] as Phase[]

    // Order updated to match server
    expect(updatedPhases[0].tasks.map((t) => t.id)).toEqual(['task-3', 'task-1', 'task-2'])

    // Task local draft content preserved
    expect(updatedPhases[0].tasks[0].title).toBe('Task 3 local draft')
    expect(updatedPhases[0].tasks[1].title).toBe('Task 1 local draft')
    expect(updatedPhases[0].tasks[2].title).toBe('Task 2 local draft')
  })

  it('6. ignores duplicate, delayed, and out-of-order events without unnecessary fetches', async () => {
    const { params } = setupTestEnvironment(true)
    const phase: Phase = {
      id: 'phase-1',
      num: '01',
      name: 'Phase 1',
      color: '#76746e',
      status: 'active',
      progress: 0,
      tasks: [{ id: 'task-1', title: 'Task 1', done: false }],
    }

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Test Roadmap',
      phases: [phase],
      saved: true,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:10:00Z',
      isPasswordEnabled: false,
    })

    mockedGetRoadmap.mockResolvedValueOnce({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [phase],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:10:00Z',
    })

    act(() => {
      root.render(<Harness params={params} onResult={() => {}} />)
    })
    await flushAsync()
    act(() => handlers.onOpen?.())
    await flushAsync()
    mockedGetRoadmap.mockClear()

    // 1. Delayed event with older timestamp arriving after newer revision
    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-09-01T10:09:00Z', // older than cached 10:10:00Z
      participant_id: 'pt_collaborator',
      task_id: 'task-1',
      action: 'task.updated',
      changed_fields: ['title'],
    }))
    await flushAsync()
    expect(mockedGetRoadmap).not.toHaveBeenCalled()

    // 2. Exact duplicate event: first event triggers GET, duplicate second event is dropped
    mockedGetRoadmap.mockResolvedValueOnce({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [{
        ...phase,
        tasks: [{ id: 'task-1', title: 'Updated title', done: false }],
      }],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:11:00Z',
    })

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-09-01T10:11:00Z',
      participant_id: 'pt_collaborator',
      task_id: 'task-1',
      action: 'task.updated',
      changed_fields: ['title'],
    }))
    await flushAsync()
    expect(mockedGetRoadmap).toHaveBeenCalledTimes(1)

    // Send the exact duplicate event again
    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-09-01T10:11:00Z',
      participant_id: 'pt_collaborator',
      task_id: 'task-1',
      action: 'task.updated',
      changed_fields: ['title'],
    }))
    await flushAsync()
    // Still only 1 call to getRoadmap, duplicate was ignored!
    expect(mockedGetRoadmap).toHaveBeenCalledTimes(1)
  })

  it('7. preserves dirty local drafts during reconnect resync', async () => {
    const { params } = setupTestEnvironment(false)
    const localPhase: Phase = {
      id: 'phase-1',
      num: '01',
      name: 'Phase 1 Local Draft',
      color: '#76746e',
      status: 'active',
      progress: 0,
      tasks: [{ id: 'task-1', title: 'Task 1 Local Unsaved', done: false }],
    }

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Test Roadmap Draft',
      phases: [localPhase],
      saved: false,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
      isPasswordEnabled: false,
    })

    // Server returns different data on reconnect
    const serverRoadmap: Roadmap = {
      project: { id: 'rm_1', name: 'Server Name' },
      roadmap: { id: 'rm_1', name: 'Server Name', isPasswordEnabled: false },
      phases: [{
        id: 'phase-1',
        num: '01',
        name: 'Server Phase Name',
        color: '#76746e',
        status: 'active',
        progress: 0,
        tasks: [{ id: 'task-1', title: 'Server Task Title', done: false }],
      }],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:15:00Z',
    }

    mockedGetRoadmap.mockResolvedValue(serverRoadmap)

    let result!: UseRoadmapRealtimeReturn
    act(() => {
      root.render(<Harness params={params} onResult={(next) => { result = next }} />)
    })
    await flushAsync()

    // Trigger reconnect
    act(() => handlers.onOpen?.())
    await flushAsync()

    // Connection proves live
    expect(result.realtimeStatus).toBe('live')

    // Wholesale replacement must NOT occur because local draft was dirty
    expect(params.roadmapState.setRoadmapNameState).not.toHaveBeenCalled()
    expect(params.roadmapState.setPhasesState).not.toHaveBeenCalled()

    // Storage cache draft remains intact
    const cached = storage.getRoadmapCache('local_1')
    expect(cached?.saved).toBe(false)
    expect(cached?.roadmapName).toBe('Test Roadmap Draft')
    expect(cached?.phases[0].name).toBe('Phase 1 Local Draft')
  })

  it('8. rejects stale authoritative fetches and preserves newer local revision', async () => {
    const { params } = setupTestEnvironment(true)
    const phase: Phase = {
      id: 'phase-1',
      num: '01',
      name: 'Phase 1',
      color: '#76746e',
      status: 'active',
      progress: 0,
      tasks: [{ id: 'task-1', title: 'Newest local task', done: false }],
    }

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Test Roadmap',
      phases: [phase],
      saved: true,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:20:00Z', // Local is already at 10:20:00Z
      isPasswordEnabled: false,
    })

    const deferred = createDeferred<Roadmap>()
    mockedGetRoadmap.mockReturnValueOnce(deferred.promise)

    act(() => {
      root.render(<Harness params={params} onResult={() => {}} />)
    })
    await flushAsync()

    act(() => handlers.onOpen?.())

    // A stale response arrives from server with older revision
    deferred.resolve({
      project: { id: 'rm_1', name: 'Stale Roadmap' },
      roadmap: { id: 'rm_1', name: 'Stale Roadmap', isPasswordEnabled: false },
      phases: [{
        id: 'phase-1',
        num: '01',
        name: 'Stale Phase 1',
        color: '#76746e',
        status: 'active',
        progress: 0,
        tasks: [{ id: 'task-1', title: 'Stale task', done: false }],
      }],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:15:00Z', // Older than 10:20:00Z!
    })
    await flushAsync()

    // State setters must not be called with stale data
    expect(params.roadmapState.setRoadmapNameState).not.toHaveBeenCalledWith('Stale Roadmap')
    expect(params.roadmapState.setPhasesState).not.toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Stale Phase 1' }),
    ])

    // Storage cache keeps 10:20:00Z
    const cached = storage.getRoadmapCache('local_1')
    expect(cached?.updatedAt).toBe('2026-09-01T10:20:00Z')
    expect(cached?.phases[0].tasks[0].title).toBe('Newest local task')
  })

  it('9. handles stream disconnection and smooth reconnection with fresh ticket', async () => {
    vi.useFakeTimers()
    try {
      const { params } = setupTestEnvironment(true)
      const phase: Phase = {
        id: 'phase-1',
        num: '01',
        name: 'Phase 1',
        color: '#76746e',
        status: 'active',
        progress: 0,
        tasks: [],
      }

      mockedGetRoadmap.mockResolvedValue({
        project: { id: 'rm_1', name: 'Test Roadmap' },
        roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
        phases: [phase],
        tagRegistry: [],
        ownerDisplayName: 'Owner',
        updatedAt: '2026-09-01T10:00:00Z',
      })

      let result!: UseRoadmapRealtimeReturn
      act(() => {
        root.render(<Harness params={params} onResult={(next) => { result = next }} />)
      })
      await flushAsync()
      act(() => handlers.onOpen?.())
      await flushAsync()
      expect(result.realtimeStatus).toBe('live')

      // Disconnect event arrives
      act(() => handlers.onError?.(new Event('error')))
      expect(result.realtimeStatus).toBe('reconnecting')
      expect(unsubscribeMock).toHaveBeenCalled()

      // Advance timer to trigger reconnect
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })

      // Reconnection requests fresh ticket and subscribes again
      expect(mockedGetEventTicket).toHaveBeenCalledTimes(2)
      expect(mockedSubscribe).toHaveBeenCalledTimes(2)

      // Reconnection opens
      act(() => handlers.onOpen?.())
      await flushAsync()
      expect(result.realtimeStatus).toBe('live')
    } finally {
      vi.useRealTimers()
    }
  })

  it('10. handles participant revocation permanently closing connection and preserving draft', async () => {
    const { params } = setupTestEnvironment(false)
    const phase: Phase = {
      id: 'phase-1',
      num: '01',
      name: 'Phase 1',
      color: '#76746e',
      status: 'active',
      progress: 0,
      tasks: [{ id: 'task-1', title: 'Local draft task', done: false }],
    }

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Test Roadmap',
      phases: [phase],
      saved: false,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
      isPasswordEnabled: false,
    })
    storage.setAuthCache('local_1', {
      serverRoadmapId: 'rm_1',
      sessionToken: 'session-token',
      role: 'editor',
      participantId: 'pt_self',
    })

    mockedGetRoadmap.mockResolvedValue({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [phase],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
    })

    let result!: UseRoadmapRealtimeReturn
    act(() => {
      root.render(<Harness params={params} onResult={(next) => { result = next }} />)
    })
    await flushAsync()
    act(() => handlers.onOpen?.())
    await flushAsync()
    expect(result.realtimeStatus).toBe('live')

    // Participant revoked event arrives for this user
    act(() => handlers.onParticipantRevoked?.({
      roadmap_id: 'rm_1',
      participant_id: 'pt_self',
      revoked_at: '2026-09-01T10:30:00Z',
    }))
    await flushAsync()

    // Access revoked event set
    expect(result.accessRevokedEvent).toBe('revoked')
    expect(unsubscribeMock).toHaveBeenCalled()

    // Auth cache cleared
    expect(storage.getAuthCache('local_1')).toBeNull()

    // Local roadmap cache preserved and marked unsaved
    const cached = storage.getRoadmapCache('local_1')
    expect(cached).not.toBeNull()
    expect(cached?.saved).toBe(false)
    expect(cached?.phases[0].tasks[0].title).toBe('Local draft task')
  })

  it('11. does not discard distinct operations sharing equal timestamps as duplicates', async () => {
    const { params } = setupTestEnvironment(true)
    const phase: Phase = {
      id: 'phase-1',
      num: '01',
      name: 'Phase 1',
      color: '#76746e',
      status: 'active',
      progress: 0,
      tasks: [
        { id: 'task-1', title: 'Task 1', done: false },
        { id: 'task-2', title: 'Task 2', done: false },
      ],
    }

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Test Roadmap',
      phases: [phase],
      saved: true,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
      isPasswordEnabled: false,
    })

    mockedGetRoadmap.mockResolvedValue({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [phase],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:05:00Z',
    })

    act(() => {
      root.render(<Harness params={params} onResult={() => {}} />)
    })
    await flushAsync()
    act(() => handlers.onOpen?.())
    await flushAsync()

    mockedGetRoadmap.mockClear()
    mockedGetRoadmap.mockResolvedValue({
      project: { id: 'rm_1', name: 'Test Roadmap' },
      roadmap: { id: 'rm_1', name: 'Test Roadmap', isPasswordEnabled: false },
      phases: [{
        ...phase,
        tasks: [
          { id: 'task-1', title: 'Task 1', done: true },
          { id: 'task-2', title: 'Task 2', done: true },
        ],
      }],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:10:00Z',
    })

    const sharedTimestamp = '2026-09-01T10:10:00Z'

    // First operation on task-1
    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      participant_id: 'pt_other',
      updated_at: sharedTimestamp,
      action: 'task.completed',
      task_id: 'task-1',
    }))

    // Distinct second operation on task-2 with the exact same timestamp
    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      participant_id: 'pt_other',
      updated_at: sharedTimestamp,
      action: 'task.completed',
      task_id: 'task-2',
    }))

    await flushAsync()

    // Both distinct operations must have been requested, not deduplicated away
    expect(mockedGetRoadmap).toHaveBeenCalled()
    const cached = storage.getRoadmapCache('local_1')
    expect(cached?.phases[0].tasks.find((t) => t.id === 'task-1')?.done).toBe(true)
    expect(cached?.phases[0].tasks.find((t) => t.id === 'task-2')?.done).toBe(true)
  })

  it('12. defers aggregate updates while local roadmap is dirty and reconciles them when draft becomes clean', async () => {
    const { params, savedRef } = setupTestEnvironment(false)
    const setPhasesState = params.roadmapState.setPhasesState
    const phase: Phase = {
      id: 'phase-1',
      num: '01',
      name: 'Phase 1',
      color: '#76746e',
      status: 'active',
      progress: 0,
      tasks: [{ id: 'task-1', title: 'Dirty local draft', done: false }],
    }

    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Local Roadmap',
      phases: [phase],
      saved: false,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:00:00Z',
      isPasswordEnabled: false,
    })

    mockedGetRoadmap.mockResolvedValue({
      project: { id: 'rm_1', name: 'Server Imported Roadmap' },
      roadmap: { id: 'rm_1', name: 'Server Imported Roadmap', isPasswordEnabled: false },
      phases: [{
        id: 'phase-imported',
        num: '01',
        name: 'Imported Phase',
        color: '#2563eb',
        status: 'active',
        progress: 0,
        tasks: [{ id: 'task-imported', title: 'Imported Task', done: false }],
      }],
      tagRegistry: [],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-09-01T10:05:00Z',
    })

    savedRef.current = false
    const dirtyParams = {
      ...params,
      lifecycle: {
        ...params.lifecycle,
        savedRef,
        isClean: false,
      },
    }

    act(() => {
      root.render(<Harness params={dirtyParams} onResult={() => {}} />)
    })
    await flushAsync()
    act(() => handlers.onOpen?.())
    await flushAsync()

    // Local dirty draft must NOT have been replaced by the open resync
    expect(setPhasesState).not.toHaveBeenCalled()
    expect(storage.getRoadmapCache('local_1')?.phases[0].tasks[0].title).toBe('Dirty local draft')

    // Remote aggregate event arrives (import/reset) while local state is dirty
    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      participant_id: 'pt_other',
      updated_at: '2026-09-01T10:15:00Z',
      action: 'roadmap.imported',
    }))
    await flushAsync()

    // Still must not overwrite dirty draft
    expect(setPhasesState).not.toHaveBeenCalled()

    // User saves or discards: local roadmap becomes clean
    savedRef.current = true
    const cleanParams = {
      ...params,
      lifecycle: {
        ...params.lifecycle,
        savedRef,
        isClean: true,
      },
    }

    act(() => {
      root.render(<Harness params={cleanParams} onResult={() => {}} />)
    })
    await flushAsync()

    // Deferred aggregate refresh must have been triggered and applied
    expect(setPhasesState).toHaveBeenCalled()
    const lastPhasesCall = vi.mocked(setPhasesState).mock.calls[vi.mocked(setPhasesState).mock.calls.length - 1][0]
    const appliedPhases = typeof lastPhasesCall === 'function' ? lastPhasesCall([]) : lastPhasesCall
    expect(appliedPhases[0].id).toBe('phase-imported')
  })
})
