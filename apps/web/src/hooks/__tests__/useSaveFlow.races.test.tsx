// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSaveFlow } from '@/hooks/useSaveFlow'
import { saveToServer } from '@/services/roadmap-crud.service'
import { ApiError } from '@/services/roadmap-http'
import type { ActivityChange, Phase } from '@/types/roadmap'

vi.mock('@/context/RoadmapContext', () => ({
  useRoadmapData: () => ({
    setTagRegistry: vi.fn(),
  }),
}))

vi.mock('@/services/roadmap-crud.service', () => ({
  createRoadmap: vi.fn(),
  getRoadmap: vi.fn(),
  saveToServer: vi.fn(),
}))

const mockedSaveToServer = vi.mocked(saveToServer)

const basePhase: Phase = {
  id: 'ph-1',
  num: '01',
  name: 'Initial Phase',
  color: '#3b82f6',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [],
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

function saveResponse(updatedAt: string): Awaited<ReturnType<typeof saveToServer>> {
  return {
    id: 'rm-1',
    name: 'RoadForge',
    owner_display_name: 'Owner',
    schema_version: '1.0',
    phases: [basePhase],
    tag_registry: [],
    is_password_enabled: false,
    created_at: '2026-07-25T16:00:00Z',
    updated_at: updatedAt,
  }
}

type SaveFlowParams = Parameters<typeof useSaveFlow>[0]
type SaveFlowResult = ReturnType<typeof useSaveFlow>

function createParams(overrides: Partial<SaveFlowParams> = {}): {
  params: SaveFlowParams
  spies: {
    setRoadmapName: ReturnType<typeof vi.fn>
    setPhases: ReturnType<typeof vi.fn>
    setSaved: ReturnType<typeof vi.fn>
    setServerRoadmapId: ReturnType<typeof vi.fn>
    setSessionToken: ReturnType<typeof vi.fn>
    setParticipantId: ReturnType<typeof vi.fn>
    setRole: ReturnType<typeof vi.fn>
    setOwnerDisplayName: ReturnType<typeof vi.fn>
    setUpdatedAt: ReturnType<typeof vi.fn>
    closeSave: ReturnType<typeof vi.fn>
    showToast: ReturnType<typeof vi.fn>
    routerReplace: ReturnType<typeof vi.fn>
  }
} {
  const spies = {
    setRoadmapName: vi.fn(),
    setPhases: vi.fn(),
    setSaved: vi.fn(),
    setServerRoadmapId: vi.fn(),
    setSessionToken: vi.fn(),
    setParticipantId: vi.fn(),
    setRole: vi.fn(),
    setOwnerDisplayName: vi.fn(),
    setUpdatedAt: vi.fn(),
    closeSave: vi.fn(),
    showToast: vi.fn(),
    routerReplace: vi.fn(),
  }

  const params: SaveFlowParams = {
    displayName: 'Alex',
    roadmapName: 'RoadForge',
    setRoadmapName: spies.setRoadmapName,
    phases: [basePhase],
    setPhases: spies.setPhases,
    tagRegistry: [],
    saved: false,
    setSaved: spies.setSaved,
    serverRoadmapId: 'rm-1',
    setServerRoadmapId: spies.setServerRoadmapId,
    sessionToken: 'tok-123',
    setSessionToken: spies.setSessionToken,
    setParticipantId: spies.setParticipantId,
    readOnly: false,
    setRole: spies.setRole,
    setOwnerDisplayName: spies.setOwnerDisplayName,
    updatedAt: '2026-07-25T16:00:00Z',
    setUpdatedAt: spies.setUpdatedAt,
    partialWriteInFlight: false,
    showActivity: false,
    closeSave: spies.closeSave,
    showToast: spies.showToast,
    routerReplace: spies.routerReplace,
    ...overrides,
  }

  return { params, spies }
}

function Harness({
  params,
  onResult,
}: {
  params: SaveFlowParams
  onResult?: (result: SaveFlowResult) => void
}) {
  const result = useSaveFlow(params)
  onResult?.(result)
  return null
}

describe('useSaveFlow races and persistence safety', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    mockedSaveToServer.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('edits made during pending manual saves are not marked saved and activity changes are preserved', async () => {
    const saveDeferred = deferred<Awaited<ReturnType<typeof saveToServer>>>()
    mockedSaveToServer.mockImplementationOnce(() => saveDeferred.promise)

    const { params, spies } = createParams()
    const resultRef = { current: null as SaveFlowResult | null }

    act(() => {
      root.render(<Harness params={params} onResult={(r) => { resultRef.current = r }} />)
    })

    const initialChange: ActivityChange = {
      action: 'phase.updated',
      phaseId: 'ph-1',
      phaseField: 'name',
      nextValue: 'In-Flight Phase',
    }
    act(() => {
      resultRef.current?.addPendingActivityChange(initialChange)
    })

    // Start manual save
    let savePromise: Promise<void> | undefined
    act(() => {
      savePromise = resultRef.current?.handleConfirmSave()
    })
    expect(mockedSaveToServer).toHaveBeenCalledTimes(1)

    // User makes a subsequent edit while saveToServer is in flight
    const subsequentChange: ActivityChange = {
      action: 'phase.updated',
      phaseId: 'ph-1',
      phaseField: 'color',
      nextValue: '#ec4899',
    }
    const modifiedPhases = [{ ...basePhase, name: 'In-Flight Phase', color: '#ec4899' }]

    act(() => {
      resultRef.current?.addPendingActivityChange(subsequentChange)
      root.render(
        <Harness
          params={{
            ...params,
            phases: modifiedPhases,
          }}
          onResult={(r) => { resultRef.current = r }}
        />,
      )
    })

    // Now resolve the in-flight save request
    await act(async () => {
      saveDeferred.resolve(saveResponse('2026-07-25T16:01:00Z'))
      await savePromise
    })

    // Timestamp was updated to acknowledge the saved snapshot
    expect(spies.setUpdatedAt).toHaveBeenCalledWith('2026-07-25T16:01:00Z')

    // But because subsequent edits landed in flight, saved must NOT be set to true
    expect(spies.setSaved).not.toHaveBeenCalledWith(true)
  })

  it('concurrent manual save and autosync do not send overlapping requests', async () => {
    const autoSyncDeferred = deferred<Awaited<ReturnType<typeof saveToServer>>>()
    mockedSaveToServer.mockImplementationOnce(() => autoSyncDeferred.promise)

    const { params, spies } = createParams({ saved: false })
    const resultRef = { current: null as SaveFlowResult | null }

    act(() => {
      root.render(<Harness params={params} onResult={(r) => { resultRef.current = r }} />)
    })

    // Trigger autosync debounce
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(mockedSaveToServer).toHaveBeenCalledTimes(1)
    expect(resultRef.current?.syncStatus).toBe('syncing')

    // While autosync is in flight, user clicks manual save
    let manualSaveCompleted = false
    act(() => {
      resultRef.current?.handleConfirmSave().then(() => {
        manualSaveCompleted = true
      })
    })

    // Crucial: handleConfirmSave must NOT launch a second concurrent saveToServer
    expect(mockedSaveToServer).toHaveBeenCalledTimes(1)
    expect(manualSaveCompleted).toBe(false)

    // Resolve in-flight autosync
    await act(async () => {
      autoSyncDeferred.resolve(saveResponse('2026-07-25T16:02:00Z'))
      await Promise.resolve()
    })

    // Manual save cleanly resolved without duplicate request or 409 conflict
    expect(mockedSaveToServer).toHaveBeenCalledTimes(1)
    expect(spies.setUpdatedAt).toHaveBeenCalledWith('2026-07-25T16:02:00Z')
    expect(spies.showToast).toHaveBeenCalledWith('Saved and ready to share.')
  })

  it('server conflict is captured and stale responses do not regress updatedAt', async () => {
    mockedSaveToServer.mockRejectedValueOnce(
      new ApiError(409, 'Conflict', 'roadmap_conflict', {
        roadmap_id: 'rm-1',
        server_updated_at: '2026-07-25T17:00:00Z',
        client_last_updated_at: '2026-07-25T16:30:00Z',
        server: {
          name: 'Remote Name',
          phases: [],
        },
      }),
    )

    const { params, spies } = createParams({ updatedAt: '2026-07-25T16:30:00Z' })
    const resultRef = { current: null as SaveFlowResult | null }

    act(() => {
      root.render(<Harness params={params} onResult={(r) => { resultRef.current = r }} />)
    })

    await act(async () => {
      await resultRef.current?.handleConfirmSave()
    })

    expect(resultRef.current?.isConflict).toBe(true)
    expect(resultRef.current?.conflictMetadata?.server_updated_at).toBe('2026-07-25T17:00:00Z')
    expect(resultRef.current?.showConflictReview).toBe(true)

    // Stale timestamp must not regress updatedAt
    expect(spies.setUpdatedAt).not.toHaveBeenCalledWith('2026-07-25T16:00:00Z')
  })

  it('roadmap switching while requests are pending discards previous roadmap response', async () => {
    const saveDeferred = deferred<Awaited<ReturnType<typeof saveToServer>>>()
    mockedSaveToServer.mockImplementationOnce(() => saveDeferred.promise)

    const { params, spies } = createParams({ serverRoadmapId: 'rm-1' })
    const resultRef = { current: null as SaveFlowResult | null }

    act(() => {
      root.render(<Harness params={params} onResult={(r) => { resultRef.current = r }} />)
    })

    let savePromise: Promise<void> | undefined
    act(() => {
      savePromise = resultRef.current?.handleConfirmSave()
    })
    expect(mockedSaveToServer).toHaveBeenCalledTimes(1)

    // User switches to Roadmap 2 while Roadmap 1 save is in flight
    act(() => {
      root.render(
        <Harness
          params={{
            ...params,
            serverRoadmapId: 'rm-2',
            roadmapName: 'Roadmap Two',
            updatedAt: '2026-07-25T18:00:00Z',
          }}
          onResult={(r) => { resultRef.current = r }}
        />,
      )
    })

    // Now Roadmap 1 response arrives
    await act(async () => {
      saveDeferred.resolve({
        id: 'rm-1',
        name: 'RoadForge',
        owner_display_name: 'Owner',
        schema_version: '1.0',
        phases: [basePhase],
        tag_registry: [],
        is_password_enabled: false,
        created_at: '2026-07-25T16:00:00Z',
        updated_at: '2026-07-25T16:05:00Z',
      })
      await savePromise
    })

    // Crucial: Roadmap 1 response must NOT update Roadmap 2's updatedAt or saved state
    expect(spies.setUpdatedAt).not.toHaveBeenCalledWith('2026-07-25T16:05:00Z')
    expect(spies.setSaved).not.toHaveBeenCalledWith(true)
  })
})
