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

const localPhase: Phase = {
  id: 'phase-1',
  num: '01',
  name: 'Local phase name',
  color: '#111111',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [{
    id: 'task-1',
    title: 'Unsaved local task title',
    done: false,
    complexity: 'medium',
    tags: ['local-only'],
    deps: [],
  }],
}

function serverRoadmap(overrides: Partial<Roadmap> = {}): Roadmap {
  return {
    project: { id: 'rm_1', name: 'Server roadmap' },
    roadmap: { id: 'rm_1', name: 'Server roadmap', isPasswordEnabled: false },
    phases: [{
      ...localPhase,
      name: 'Remote phase name',
      color: '#abcdef',
      colorMode: 'manual',
      tasks: [{
        ...localPhase.tasks[0],
        title: 'Server task title',
        done: true,
      }],
    }],
    tagRegistry: [],
    ownerDisplayName: 'Owner',
    updatedAt: '2026-08-14T10:10:00Z',
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
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
    lockState: {
      setLocks: vi.fn(),
    },
  }
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useRoadmapRealtime structure rebasing', () => {
  let container: HTMLDivElement
  let root: Root
  let handlers: RealtimeHandlers

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    handlers = {}
    mockedGetRoadmap.mockReset().mockResolvedValue(serverRoadmap())
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
      updatedAt: '2026-08-14T10:00:00Z',
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

  function render(savedRef = { current: false }) {
    const params = createParams(savedRef)
    act(() => root.render(<Harness params={params} />))
    return { params, savedRef }
  }

  it('rebases a remote phase field directly onto an unrelated dirty draft', async () => {
    const { params } = render()
    await flushAsync()

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T10:10:00Z',
      participant_id: 'pt_other',
      phase_id: 'phase-1',
      action: 'phase.updated',
      changed_fields: ['name'],
    }))
    await flushAsync()

    expect(mockedGetRoadmap).toHaveBeenCalledTimes(1)
    expect(params.roadmapState.setPhasesState).toHaveBeenCalledTimes(1)
    const applied = vi.mocked(params.roadmapState.setPhasesState).mock.calls[0][0] as Phase[]
    expect(applied[0].name).toBe('Remote phase name')
    expect(applied[0].color).toBe('#111111')
    expect(applied[0].colorMode).toBe('auto')
    expect(applied[0].tasks).toEqual(localPhase.tasks)
    expect(params.roadmapState.setRoadmapNameState).not.toHaveBeenCalled()
    expect(params.metadataState.setUpdatedAtState).toHaveBeenCalledWith(
      '2026-08-14T10:10:00Z',
    )

    const cached = storage.getRoadmapCache('local_1')
    expect(cached?.saved).toBe(false)
    expect(cached?.roadmapName).toBe('Unsaved local roadmap name')
    expect(cached?.phases[0].name).toBe('Remote phase name')
    expect(cached?.phases[0].tasks).toEqual(localPhase.tasks)
  })

  it('rebases a remote roadmap rename without replacing dirty phases', async () => {
    const { params } = render()
    await flushAsync()

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T10:10:00Z',
      participant_id: 'pt_other',
      action: 'roadmap.renamed',
      roadmap_fields: ['name'],
    }))
    await flushAsync()

    expect(params.roadmapState.setRoadmapNameState).toHaveBeenCalledWith('Server roadmap')
    expect(params.roadmapState.setPhasesState).not.toHaveBeenCalled()
    const cached = storage.getRoadmapCache('local_1')
    expect(cached?.roadmapName).toBe('Server roadmap')
    expect(cached?.phases).toEqual([localPhase])
    expect(cached?.saved).toBe(false)
    expect(cached?.updatedAt).toBe('2026-08-14T10:10:00Z')
  })

  it('retains queued scoped events when a full refresh becomes unsafe before it resolves', async () => {
    const savedRef = { current: true }
    const { params } = render(savedRef)
    await flushAsync()

    const first = deferred<Roadmap>()
    const second = serverRoadmap({
      roadmap: { id: 'rm_1', name: 'Newest server roadmap', isPasswordEnabled: false },
      phases: [{ ...serverRoadmap().phases[0], name: 'Newest remote phase' }],
      updatedAt: '2026-08-14T10:20:00Z',
    })
    mockedGetRoadmap.mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(second)

    act(() => handlers.onOpen?.())
    expect(mockedGetRoadmap).toHaveBeenCalledTimes(1)

    // Queue an aggregate refresh while the draft is still clean, then queue
    // a safely scoped phase event behind it.
    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T10:15:00Z',
      participant_id: 'pt_other',
      action: 'phase.created',
    }))
    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T10:20:00Z',
      participant_id: 'pt_other',
      phase_id: 'phase-1',
      action: 'phase.updated',
      changed_fields: ['name'],
    }))
    expect(mockedGetRoadmap).toHaveBeenCalledTimes(1)

    // Local work becomes dirty before either authoritative refresh can be
    // applied. Full replacement is now unsafe, but the queued phase scope
    // must still survive and apply from the follow-up snapshot.
    savedRef.current = false
    await act(async () => {
      first.resolve(serverRoadmap())
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
    expect(applied[0].name).toBe('Newest remote phase')
    expect(applied[0].tasks).toEqual(localPhase.tasks)
    expect(params.roadmapState.setRoadmapNameState).not.toHaveBeenCalledWith(
      'Newest server roadmap',
    )
  })

  it('does not advance the revision when a dirty scoped event cannot be reconciled', async () => {
    const { params } = render()
    await flushAsync()
    mockedGetRoadmap.mockResolvedValueOnce(serverRoadmap())

    act(() => handlers.onUpdated?.({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T10:10:00Z',
      participant_id: 'pt_other',
      phase_id: 'phase-missing',
      action: 'phase.updated',
      changed_fields: ['name'],
    }))
    await flushAsync()

    expect(params.roadmapState.setPhasesState).not.toHaveBeenCalled()
    expect(params.metadataState.setUpdatedAtState).not.toHaveBeenCalled()
    expect(storage.getRoadmapCache('local_1')?.updatedAt).toBe(
      '2026-08-14T10:00:00Z',
    )
  })
})
