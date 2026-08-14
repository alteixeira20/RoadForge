// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePhaseStructureSync } from '@/hooks/usePhaseStructureSync'
import {
  createServerPhase,
  deleteServerPhase,
  reorderServerPhases,
} from '@/services/roadmap-structure.service'
import { ApiConnectionError, ApiError } from '@/services/roadmap-http'
import type { Phase } from '@/types/roadmap'

vi.mock('@/services/roadmap-structure.service', () => ({
  createServerPhase: vi.fn(),
  deleteServerPhase: vi.fn(),
  reorderServerPhases: vi.fn(),
}))

const mockedCreateServerPhase = vi.mocked(createServerPhase)
const mockedDeleteServerPhase = vi.mocked(deleteServerPhase)
const mockedReorderServerPhases = vi.mocked(reorderServerPhases)

const phaseA: Phase = {
  id: 'phase-a',
  num: '01',
  name: 'Alpha',
  color: '#111111',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [],
}

const phaseB: Phase = {
  id: 'phase-b',
  num: '02',
  name: 'New phase',
  color: '#222222',
  colorMode: 'auto',
  status: 'future',
  progress: 0,
  tasks: [],
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

type HookResult = ReturnType<typeof usePhaseStructureSync>

function Harness({
  phases,
  setPhases,
  setSaved,
  setUpdatedAt,
  beginFocusedWrite,
  endFocusedWrite,
  onSuccess,
  onSessionExpired,
  showToast,
  onResult,
}: {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  setUpdatedAt: (updatedAt: string) => void
  beginFocusedWrite: () => void
  endFocusedWrite: () => void
  onSuccess: () => void
  onSessionExpired: () => void
  showToast: (message: string) => void
  onResult: (result: HookResult) => void
}) {
  onResult(usePhaseStructureSync({
    phases,
    setPhases,
    setSaved,
    serverRoadmapId: 'rm_1',
    sessionToken: 'session-token',
    updatedAt: '2026-08-14T09:00:00Z',
    setUpdatedAt,
    showToast,
    onSuccess,
    onSessionExpired,
    beginFocusedWrite,
    endFocusedWrite,
  }))
  return null
}

describe('usePhaseStructureSync', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockedCreateServerPhase.mockReset()
    mockedDeleteServerPhase.mockReset()
    mockedReorderServerPhases.mockReset()
    localStorage.clear()
    sessionStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderHook(initialPhases: Phase[] = [phaseA]) {
    let currentPhases = initialPhases
    const setPhases = vi.fn((next: Phase[]) => {
      currentPhases = next
    })
    const setSaved = vi.fn()
    const setUpdatedAt = vi.fn()
    const beginFocusedWrite = vi.fn()
    const endFocusedWrite = vi.fn()
    const onSuccess = vi.fn()
    const onSessionExpired = vi.fn()
    const showToast = vi.fn()
    let result!: HookResult

    act(() => {
      root.render(
        <Harness
          phases={currentPhases}
          setPhases={setPhases}
          setSaved={setSaved}
          setUpdatedAt={setUpdatedAt}
          beginFocusedWrite={beginFocusedWrite}
          endFocusedWrite={endFocusedWrite}
          onSuccess={onSuccess}
          onSessionExpired={onSessionExpired}
          showToast={showToast}
          onResult={(next) => { result = next }}
        />,
      )
    })

    return {
      get result() { return result },
      get phases() { return currentPhases },
      setPhases,
      setSaved,
      setUpdatedAt,
      beginFocusedWrite,
      endFocusedWrite,
      onSuccess,
      onSessionExpired,
      showToast,
    }
  }

  it('holds reorder behind a pending phase creation barrier', async () => {
    const create = deferred<{ phases: Phase[]; updatedAt: string }>()
    mockedCreateServerPhase.mockImplementationOnce(() => create.promise)
    mockedReorderServerPhases.mockResolvedValueOnce({
      phases: [{ ...phaseB, num: '01' }, { ...phaseA, num: '02' }],
      updatedAt: '2026-08-14T09:02:00Z',
    })
    const hook = renderHook()

    act(() => {
      expect(hook.result.createSyncedPhase(phaseB, { onAggregateFallback: vi.fn() })).toBe(true)
      expect(hook.result.reorderSyncedPhases(
        ['phase-b', 'phase-a'],
        { onAggregateFallback: vi.fn() },
      )).toBe(true)
    })

    expect(hook.phases.map((phase) => phase.id)).toEqual(['phase-b', 'phase-a'])
    expect(hook.beginFocusedWrite).toHaveBeenCalledTimes(2)
    await act(async () => Promise.resolve())
    expect(mockedReorderServerPhases).not.toHaveBeenCalled()

    await act(async () => {
      create.resolve({
        phases: [phaseA, phaseB],
        updatedAt: '2026-08-14T09:01:00Z',
      })
      await create.promise
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockedReorderServerPhases).toHaveBeenCalledWith(
      'rm_1',
      ['phase-b', 'phase-a'],
      'session-token',
    )
    expect(hook.endFocusedWrite).toHaveBeenCalledTimes(2)
    expect(hook.setSaved).not.toHaveBeenCalled()
  })

  it('resolves an ambiguous create as uncertain and preserves the optimistic phase', async () => {
    mockedCreateServerPhase.mockRejectedValueOnce(new ApiConnectionError())
    const fallback = vi.fn()
    const hook = renderHook()
    let readiness!: Promise<'ready' | 'absent' | 'uncertain'>

    act(() => {
      hook.result.createSyncedPhase(phaseB, { onAggregateFallback: fallback })
      readiness = hook.result.waitForPhaseReady('phase-b')
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await expect(readiness).resolves.toBe('uncertain')
    expect(hook.phases.map((phase) => phase.id)).toEqual(['phase-a', 'phase-b'])
    expect(hook.setSaved).toHaveBeenCalledWith(false)
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(hook.beginFocusedWrite).toHaveBeenCalledTimes(1)
    expect(hook.endFocusedWrite).toHaveBeenCalledTimes(1)
  })

  it('rolls back a definitive delete rejection while releasing the focused gate', async () => {
    mockedDeleteServerPhase.mockRejectedValueOnce(new ApiError(403, 'Forbidden'))
    const hook = renderHook([phaseA, phaseB])

    act(() => {
      hook.result.deleteSyncedPhase('phase-a', { onAggregateFallback: vi.fn() })
    })
    expect(hook.phases.map((phase) => phase.id)).toEqual(['phase-b'])

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(hook.phases.map((phase) => phase.id)).toEqual(['phase-a', 'phase-b'])
    expect(hook.showToast).toHaveBeenCalledWith('You do not have permission to delete phases.')
    expect(hook.endFocusedWrite).toHaveBeenCalledTimes(1)
  })
})
