// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useRoadmapRealtime,
  type UseRoadmapRealtimeParams,
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

const phaseA: Phase = {
  id: 'phase-a',
  num: '01',
  name: 'Alpha local draft',
  color: '#111111',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [{
    id: 'task-a',
    title: 'A local draft',
    done: false,
    complexity: 'medium',
    tags: ['local-a'],
    deps: [],
  }],
}

const phaseB: Phase = {
  id: 'phase-b',
  num: '02',
  name: 'Beta local draft',
  color: '#222222',
  colorMode: 'auto',
  status: 'future',
  progress: 0,
  tasks: [{
    id: 'task-b',
    title: 'B local draft',
    done: false,
    complexity: 'medium',
    desc: 'preserve me',
    deps: ['task-a'],
  }],
}

const pendingLocalPhase: Phase = {
  id: 'phase-local-pending',
  num: '03',
  name: 'Pending local create',
  color: '#333333',
  colorMode: 'auto',
  status: 'future',
  progress: 0,
  tasks: [],
}

const remotePhaseC: Phase = {
  id: 'phase-c',
  num: '03',
  name: 'Remote C',
  color: '#abcdef',
  colorMode: 'manual',
  status: 'future',
  progress: 0,
  tasks: [],
}

function serverRoadmap(phases: Phase[], updatedAt = '2026-08-14T11:10:00Z'): Roadmap {
  return {
    project: { id: 'rm_1', name: 'Server roadmap' },
    roadmap: { id: 'rm_1', name: 'Server roadmap', isPasswordEnabled: false },
    phases,
    tagRegistry: [],
    ownerDisplayName: 'Owner',
    updatedAt,
  }
}

function serverPhase(phase: Phase, overrides: Partial<Phase> = {}): Phase {
  return {
    ...phase,
    name: `Server ${phase.name}`,
    tasks: phase.tasks.map((task) => ({ ...task, title: `Server ${task.title}` })),
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

function Harness({ params }: { params: UseRoadmapRealtimeParams }) {
  useRoadmapRealtime(params)
  return null
}

function createParams(savedRef: { current: boolean }): UseRoadmapRealtimeParams {
  return {
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
    lockState: { setLocks: vi.fn() },
  }
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useRoadmapRealtime phase structure rebasing', () => {
  let container: HTMLDivElement
  let root: Root
  let handlers: RealtimeHandlers

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    handlers = {}
    mockedGetRoadmap.mockReset()
    mockedGetLocks.mockReset().mockResolvedValue([])
    mockedGetEventTicket.mockReset().mockResolvedValue({ expires_in: 30 })
    mockedSubscribe.mockReset().mockImplementation((_id, nextHandlers) => {
      handlers = nextHandlers
      return vi.fn()
    })
    storage.setActiveRoadmapId('local_1')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function render(localPhases: Phase[], savedRef = { current: false }) {
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Unsaved local roadmap name',
      phases: localPhases,
      saved: savedRef.current,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-08-14T11:00:00Z',
      isPasswordEnabled: false,
    })
    const params = createParams(savedRef)
    act(() => root.render(<Harness params={params} />))
    return { params, savedRef }
  }

  it('adds a remote phase to a dirty draft without replacing unrelated local phases', async () => {
    mockedGetRoadmap.mockResolvedValueOnce(serverRoadmap([
      serverPhase(phaseA),
      serverPhase(phaseB),
      remotePhaseC,
    ]))
    const { params } = render([phaseA, phaseB])
    await flushAsync()

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T11:10:00Z',
      participant_id: 'pt_other',
      action: 'phase.created',
      phase_operation: 'created',
      phase_id: 'phase-c',
    }))
    await flushAsync()

    const applied = vi.mocked(params.roadmapState.setPhasesState).mock.calls[0][0] as Phase[]
    expect(applied.map((phase) => phase.id)).toEqual(['phase-a', 'phase-b', 'phase-c'])
    expect(applied[0]).toEqual(phaseA)
    expect(applied[1]).toEqual(phaseB)
    expect(applied[2]).toEqual(remotePhaseC)
    expect(params.metadataState.setUpdatedAtState).toHaveBeenCalledWith(
      '2026-08-14T11:10:00Z',
    )
    expect(storage.getRoadmapCache('local_1')?.saved).toBe(false)
  })

  it('removes a remote-deleted phase, cleans dependencies, and preserves surviving dirty task fields', async () => {
    mockedGetRoadmap.mockResolvedValueOnce(serverRoadmap([
      serverPhase(phaseB, { num: '01' }),
    ]))
    const { params } = render([phaseA, phaseB])
    await flushAsync()

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T11:10:00Z',
      participant_id: 'pt_other',
      action: 'phase.deleted',
      phase_operation: 'deleted',
      phase_id: 'phase-a',
    }))
    await flushAsync()

    const applied = vi.mocked(params.roadmapState.setPhasesState).mock.calls[0][0] as Phase[]
    expect(applied.map((phase) => phase.id)).toEqual(['phase-b'])
    expect(applied[0].name).toBe('Beta local draft')
    expect(applied[0].tasks[0]).toEqual(expect.objectContaining({
      title: 'B local draft',
      desc: 'preserve me',
      deps: [],
    }))
    expect(storage.getRoadmapCache('local_1')?.updatedAt).toBe(
      '2026-08-14T11:10:00Z',
    )
  })

  it('applies remote server order while retaining a local-only pending create and dirty contents', async () => {
    mockedGetRoadmap.mockResolvedValueOnce(serverRoadmap([
      serverPhase(phaseB, { num: '01' }),
      serverPhase(phaseA, { num: '02' }),
    ]))
    const { params } = render([phaseA, pendingLocalPhase, phaseB])
    await flushAsync()

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T11:10:00Z',
      participant_id: 'pt_other',
      action: 'phase.reordered',
      phase_operation: 'reordered',
      phase_ids: ['phase-b', 'phase-a'],
    }))
    await flushAsync()

    const applied = vi.mocked(params.roadmapState.setPhasesState).mock.calls[0][0] as Phase[]
    expect(applied.map((phase) => phase.id)).toEqual([
      'phase-b',
      'phase-a',
      'phase-local-pending',
    ])
    expect(applied[0].name).toBe('Beta local draft')
    expect(applied[1].tasks[0].title).toBe('A local draft')
    expect(applied[2]).toEqual(pendingLocalPhase)
  })

  it('lets final phase deletion supersede a queued field scope for that same phase', async () => {
    const first = deferred<Roadmap>()
    const finalSnapshot = serverRoadmap([
      serverPhase(phaseB, { num: '01' }),
    ], '2026-08-14T11:20:00Z')
    mockedGetRoadmap
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(finalSnapshot)

    const savedRef = { current: true }
    const { params } = render([phaseA, phaseB], savedRef)
    await flushAsync()

    act(() => handlers.onOpen?.())
    expect(mockedGetRoadmap).toHaveBeenCalledTimes(1)

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T11:15:00Z',
      participant_id: 'pt_other',
      action: 'phase.updated',
      phase_id: 'phase-a',
      changed_fields: ['name'],
    }))
    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T11:20:00Z',
      participant_id: 'pt_other',
      action: 'phase.deleted',
      phase_operation: 'deleted',
      phase_id: 'phase-a',
    }))

    savedRef.current = false
    await act(async () => {
      first.resolve(finalSnapshot)
      await first.promise
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockedGetRoadmap).toHaveBeenCalledTimes(2)
    await flushAsync()

    const phaseCalls = vi.mocked(params.roadmapState.setPhasesState).mock.calls
    expect(phaseCalls).toHaveLength(1)
    const applied = phaseCalls[0][0] as Phase[]
    expect(applied.map((phase) => phase.id)).toEqual(['phase-b'])
    expect(applied[0].tasks[0].title).toBe('B local draft')
    expect(params.metadataState.setUpdatedAtState).toHaveBeenCalledWith(
      '2026-08-14T11:20:00Z',
    )
    expect(storage.getRoadmapCache('local_1')?.updatedAt).toBe(
      '2026-08-14T11:20:00Z',
    )
  })
})
