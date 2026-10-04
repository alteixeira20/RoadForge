// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRoadmapHydration, type HydrationSetters } from '@/hooks/useRoadmapHydration'
import { storage } from '@/lib/storage'
import { getRoadmap } from '@/services/roadmap-crud.service'
import { ApiError, BROWSER_SESSION_TOKEN } from '@/services/roadmap-http'
import type { Phase } from '@/types/roadmap'

vi.mock('@/services/roadmap-crud.service', () => ({
  getRoadmap: vi.fn(),
}))

const mockedGetRoadmap = vi.mocked(getRoadmap)

const basePhase: Phase = {
  id: 'ph-1',
  num: '01',
  name: 'Base Phase',
  color: '#3b82f6',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [],
}

const offlinePhase: Phase = {
  ...basePhase,
  name: 'Offline Edited Phase',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createSetters(): {
  setters: HydrationSetters
  spies: {
    setRoadmapNameState: ReturnType<typeof vi.fn>
    setPhasesState: ReturnType<typeof vi.fn>
    setSavedState: ReturnType<typeof vi.fn>
    setActiveRoadmapIdState: ReturnType<typeof vi.fn>
    setTagRegistryState: ReturnType<typeof vi.fn>
    setServerRoadmapIdState: ReturnType<typeof vi.fn>
    setSessionTokenState: ReturnType<typeof vi.fn>
    setParticipantIdState: ReturnType<typeof vi.fn>
    setRoleState: ReturnType<typeof vi.fn>
    setDisplayNameState: ReturnType<typeof vi.fn>
    setIsPasswordEnabledState: ReturnType<typeof vi.fn>
    setOwnerDisplayNameState: ReturnType<typeof vi.fn>
    setUpdatedAtState: ReturnType<typeof vi.fn>
    setIsSampleState: ReturnType<typeof vi.fn>
    setLocks: ReturnType<typeof vi.fn>
  }
} {
  const spies = {
    setRoadmapNameState: vi.fn(),
    setPhasesState: vi.fn(),
    setSavedState: vi.fn(),
    setActiveRoadmapIdState: vi.fn(),
    setTagRegistryState: vi.fn(),
    setServerRoadmapIdState: vi.fn(),
    setSessionTokenState: vi.fn(),
    setParticipantIdState: vi.fn(),
    setRoleState: vi.fn(),
    setDisplayNameState: vi.fn(),
    setIsPasswordEnabledState: vi.fn(),
    setOwnerDisplayNameState: vi.fn(),
    setUpdatedAtState: vi.fn(),
    setIsSampleState: vi.fn(),
    setLocks: vi.fn(),
  }

  const setters: HydrationSetters = {
    roadmapState: {
      setRoadmapNameState: spies.setRoadmapNameState,
      setPhasesState: spies.setPhasesState,
      setSavedState: spies.setSavedState,
      setActiveRoadmapIdState: spies.setActiveRoadmapIdState,
      setTagRegistryState: spies.setTagRegistryState,
    },
    sessionState: {
      setServerRoadmapIdState: spies.setServerRoadmapIdState,
      setSessionTokenState: spies.setSessionTokenState,
      setParticipantIdState: spies.setParticipantIdState,
      setRoleState: spies.setRoleState,
    },
    metadataState: {
      setDisplayNameState: spies.setDisplayNameState,
      setIsPasswordEnabledState: spies.setIsPasswordEnabledState,
      setOwnerDisplayNameState: spies.setOwnerDisplayNameState,
      setUpdatedAtState: spies.setUpdatedAtState,
      setIsSampleState: spies.setIsSampleState,
    },
    lifecycleState: {
      setLocks: spies.setLocks,
    },
  }

  return { setters, spies }
}

function Harness({
  setters,
  onHook,
}: {
  setters: HydrationSetters
  onHook?: (hook: ReturnType<typeof useRoadmapHydration>) => void
}) {
  const hook = useRoadmapHydration(setters)
  onHook?.(hook)
  return null
}

describe('useRoadmapHydration persistence invariants', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    mockedGetRoadmap.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('offline edit -> tab closes -> server becomes available -> reopen preserves dirty draft', async () => {
    // 1. Simulate offline edit saved to local cache before tab closed
    storage.setRoadmapCache('rm-server-1', {
      roadmapName: 'Local Unsaved Name',
      phases: [offlinePhase],
      saved: false,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-07-25T16:00:00Z',
      isPasswordEnabled: false,
      tagRegistry: [],
    })
    storage.setAuthCache('rm-server-1', {
      serverRoadmapId: 'rm-server-1',
      sessionToken: BROWSER_SESSION_TOKEN,
      participantId: 'p-owner',
      role: 'owner',
    })
    storage.setActiveRoadmapId('rm-server-1')
    storage.setLastRoadmapId('rm-server-1')

    // 2. Server has older snapshot
    const serverDeferred = deferred<Awaited<ReturnType<typeof getRoadmap>>>()
    mockedGetRoadmap.mockImplementationOnce(() => serverDeferred.promise)

    const { setters, spies } = createSetters()

    act(() => {
      root.render(<Harness setters={setters} />)
    })

    // Local dirty cache loaded first
    expect(spies.setRoadmapNameState).toHaveBeenCalledWith('Local Unsaved Name')
    expect(spies.setPhasesState).toHaveBeenCalledWith([offlinePhase])
    expect(spies.setSavedState).toHaveBeenCalledWith(false)

    // Clear call history to track server response handling
    spies.setRoadmapNameState.mockClear()
    spies.setPhasesState.mockClear()
    spies.setSavedState.mockClear()

    // 3. Server becomes available and responds with older server data
    await act(async () => {
      serverDeferred.resolve({
        project: { id: 'proj-1', name: 'RoadForge' },
        roadmap: {
          id: 'rm-server-1',
          name: 'Old Server Name',
          isPasswordEnabled: false,
        },
        phases: [basePhase],
        ownerDisplayName: 'Owner',
        updatedAt: '2026-07-25T16:00:00Z',
        tagRegistry: [],
      })
      await Promise.resolve()
    })

    // Local dirty edits must NOT be overwritten by the server response
    expect(spies.setRoadmapNameState).not.toHaveBeenCalledWith('Old Server Name')
    expect(spies.setPhasesState).not.toHaveBeenCalledWith([basePhase])
    expect(spies.setSavedState).not.toHaveBeenCalledWith(true)

    // Storage cache must preserve the dirty local draft
    const cached = storage.getRoadmapCache('rm-server-1')
    expect(cached).not.toBeNull()
    expect(cached?.saved).toBe(false)
    expect(cached?.roadmapName).toBe('Local Unsaved Name')
    expect(cached?.phases).toEqual([offlinePhase])
  })

  it('clean cache replacement safely replaces when local cache is clean', async () => {
    storage.setRoadmapCache('rm-clean-1', {
      roadmapName: 'Old Title',
      phases: [basePhase],
      saved: true,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-07-25T15:00:00Z',
      isPasswordEnabled: false,
      tagRegistry: [],
    })
    storage.setAuthCache('rm-clean-1', {
      serverRoadmapId: 'rm-clean-1',
      sessionToken: BROWSER_SESSION_TOKEN,
      participantId: 'p-1',
      role: 'owner',
    })
    storage.setActiveRoadmapId('rm-clean-1')

    mockedGetRoadmap.mockResolvedValueOnce({
      project: { id: 'proj-1', name: 'RoadForge' },
      roadmap: {
        id: 'rm-clean-1',
        name: 'New Server Title',
        isPasswordEnabled: false,
      },
      phases: [{ ...basePhase, name: 'Server Phase' }],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-07-25T16:00:00Z',
      tagRegistry: [],
    })

    const { setters, spies } = createSetters()

    await act(async () => {
      root.render(<Harness setters={setters} />)
      await Promise.resolve()
    })

    expect(spies.setRoadmapNameState).toHaveBeenLastCalledWith('New Server Title')
    expect(spies.setSavedState).toHaveBeenLastCalledWith(true)

    const cached = storage.getRoadmapCache('rm-clean-1')
    expect(cached?.roadmapName).toBe('New Server Title')
    expect(cached?.saved).toBe(true)
    expect(cached?.updatedAt).toBe('2026-07-25T16:00:00Z')
  })

  it('safely reconciles when a dirty draft already matches the server snapshot', async () => {
    // Local cache was marked saved: false, but content is identical to server
    storage.setRoadmapCache('rm-match-1', {
      roadmapName: 'Identical Title',
      phases: [basePhase],
      saved: false,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-07-25T15:00:00Z',
      isPasswordEnabled: false,
      tagRegistry: [],
    })
    storage.setAuthCache('rm-match-1', {
      serverRoadmapId: 'rm-match-1',
      sessionToken: BROWSER_SESSION_TOKEN,
      participantId: 'p-1',
      role: 'owner',
    })
    storage.setActiveRoadmapId('rm-match-1')

    mockedGetRoadmap.mockResolvedValueOnce({
      project: { id: 'proj-1', name: 'RoadForge' },
      roadmap: {
        id: 'rm-match-1',
        name: 'Identical Title',
        isPasswordEnabled: false,
      },
      phases: [basePhase],
      ownerDisplayName: 'Owner',
      updatedAt: '2026-07-25T16:00:00Z',
      tagRegistry: [],
    })

    const { setters, spies } = createSetters()

    await act(async () => {
      root.render(<Harness setters={setters} />)
      await Promise.resolve()
    })

    // Reconciled: marks saved = true and updates updatedAt
    expect(spies.setSavedState).toHaveBeenLastCalledWith(true)
    expect(spies.setUpdatedAtState).toHaveBeenLastCalledWith('2026-07-25T16:00:00Z')

    const cached = storage.getRoadmapCache('rm-match-1')
    expect(cached?.saved).toBe(true)
    expect(cached?.updatedAt).toBe('2026-07-25T16:00:00Z')
  })

  it('session expiration during dirty local editing preserves local work', async () => {
    storage.setRoadmapCache('rm-session-exp', {
      roadmapName: 'My Draft with Unsaved Work',
      phases: [offlinePhase],
      saved: false,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-07-25T16:00:00Z',
      isPasswordEnabled: false,
      tagRegistry: [],
    })
    storage.setAuthCache('rm-session-exp', {
      serverRoadmapId: 'rm-session-exp',
      sessionToken: BROWSER_SESSION_TOKEN,
      participantId: 'p-1',
      role: 'owner',
    })
    storage.setActiveRoadmapId('rm-session-exp')

    mockedGetRoadmap.mockRejectedValueOnce(
      new ApiError(401, 'Session expired', 'session_expired'),
    )

    const { setters, spies } = createSetters()
    const hookResultRef = { current: null as ReturnType<typeof useRoadmapHydration> | null }

    await act(async () => {
      root.render(
        <Harness
          setters={setters}
          onHook={(h) => { hookResultRef.current = h }}
        />,
      )
      await Promise.resolve()
    })

    expect(hookResultRef.current?.sessionExpiredRoadmapId).toBe('rm-session-exp')
    expect(spies.setSavedState).toHaveBeenLastCalledWith(false)
    expect(storage.getAuthCache('rm-session-exp')).toBeNull()

    // Local dirty cache must be preserved
    const cached = storage.getRoadmapCache('rm-session-exp')
    expect(cached).not.toBeNull()
    expect(cached?.saved).toBe(false)
    expect(cached?.roadmapName).toBe('My Draft with Unsaved Work')
    expect(cached?.phases).toEqual([offlinePhase])
  })

  it('createLocalRoadmap does not switch or discard current draft if storage write fails', () => {
    storage.setRoadmapCache('current-draft', {
      roadmapName: 'Existing Important Work',
      phases: [basePhase],
      saved: false,
      ownerDisplayName: null,
      updatedAt: null,
      isPasswordEnabled: false,
    })
    storage.setActiveRoadmapId('current-draft')

    const { setters, spies } = createSetters()
    let hookResult: ReturnType<typeof useRoadmapHydration> | null = null

    act(() => {
      root.render(
        <Harness
          setters={setters}
          onHook={(h) => { hookResult = h }}
        />,
      )
    })

    // Simulate quota exhaustion on writing new roadmap
    vi.spyOn(storage, 'setRoadmapCache').mockReturnValue(false)

    let createdId = ''
    act(() => {
      createdId = hookResult!.createLocalRoadmap('New Broken Roadmap', [])
    })

    // Active roadmap was NOT switched away
    expect(storage.getActiveRoadmapId()).toBe('current-draft')
    expect(createdId).toBe('current-draft')

    // Current draft state was not wiped
    expect(spies.setRoadmapNameState).not.toHaveBeenCalledWith('New Broken Roadmap')
    vi.restoreAllMocks()
    expect(storage.getRoadmapCache('current-draft')?.roadmapName).toBe('Existing Important Work')
  })
})
