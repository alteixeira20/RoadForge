// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePhasePatch } from '@/hooks/usePhasePatch'
import { patchPhaseFields } from '@/services/roadmap-structure.service'
import { ApiConnectionError } from '@/services/roadmap-http'
import type { Phase } from '@/types/roadmap'

vi.mock('@/services/roadmap-structure.service', () => ({
  patchPhaseFields: vi.fn(),
}))

const mockedPatchPhaseFields = vi.mocked(patchPhaseFields)

const initialPhases: Phase[] = [
  {
    id: 'phase-1',
    num: '01',
    name: 'Planning',
    color: '#111111',
    colorMode: 'auto',
    status: 'active',
    progress: 0,
    tasks: [],
  },
  {
    id: 'phase-2',
    num: '02',
    name: 'Build',
    color: '#222222',
    colorMode: 'auto',
    status: 'future',
    progress: 0,
    tasks: [],
  },
]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type HookResult = ReturnType<typeof usePhasePatch>

function Harness({
  phases,
  setPhases,
  setSaved,
  setUpdatedAt,
  onResult,
}: {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  setUpdatedAt: (updatedAt: string) => void
  onResult: (result: HookResult) => void
}) {
  onResult(usePhasePatch({
    phases,
    setPhases,
    setSaved,
    serverRoadmapId: 'rm_1',
    sessionToken: 'session-token',
    setUpdatedAt,
  }))
  return null
}

describe('usePhasePatch', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockedPatchPhaseFields.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('optimistically patches a phase then confirms only authoritative fields', async () => {
    const setPhases = vi.fn()
    const setSaved = vi.fn()
    const setUpdatedAt = vi.fn()
    mockedPatchPhaseFields.mockResolvedValue({
      phases: [{ ...initialPhases[0], name: 'Server normalized' }, initialPhases[1]],
      updatedAt: '2026-08-14T09:00:00Z',
    })

    let result!: HookResult
    act(() => {
      root.render(
        <Harness
          phases={initialPhases}
          setPhases={setPhases}
          setSaved={setSaved}
          setUpdatedAt={setUpdatedAt}
          onResult={(next) => { result = next }}
        />,
      )
    })

    act(() => {
      expect(result.patchSyncedPhase({
        phaseId: 'phase-1',
        updates: { name: '  Server normalized  ' },
      })).toBe(true)
    })

    expect(setPhases).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'phase-1', name: '  Server normalized  ' }),
      initialPhases[1],
    ])

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockedPatchPhaseFields).toHaveBeenCalledWith(
      'rm_1',
      'phase-1',
      { name: '  Server normalized  ' },
      'session-token',
    )
    expect(setPhases).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'phase-1', name: 'Server normalized' }),
      initialPhases[1],
    ])
    expect(setUpdatedAt).toHaveBeenCalledWith('2026-08-14T09:00:00Z')
    expect(setSaved).not.toHaveBeenCalled()
  })

  it('serializes same-phase writes and never lets an earlier response replace a newer edit', async () => {
    const first = deferred<{ phases: Phase[]; updatedAt: string }>()
    const second = deferred<{ phases: Phase[]; updatedAt: string }>()
    mockedPatchPhaseFields
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    let currentPhases = initialPhases
    const setPhases = vi.fn((next: Phase[]) => {
      currentPhases = next
    })
    const setSaved = vi.fn()
    const setUpdatedAt = vi.fn()
    let result!: HookResult

    const render = () => {
      act(() => {
        root.render(
          <Harness
            phases={currentPhases}
            setPhases={setPhases}
            setSaved={setSaved}
            setUpdatedAt={setUpdatedAt}
            onResult={(next) => { result = next }}
          />,
        )
      })
    }
    render()

    act(() => {
      result.patchSyncedPhase({ phaseId: 'phase-1', updates: { name: 'First' } })
      result.patchSyncedPhase({ phaseId: 'phase-1', updates: { name: 'Second' } })
    })

    expect(currentPhases[0].name).toBe('Second')
    await act(async () => Promise.resolve())
    expect(mockedPatchPhaseFields).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve({
        phases: [{ ...initialPhases[0], name: 'First' }, initialPhases[1]],
        updatedAt: '2026-08-14T09:01:00Z',
      })
      await first.promise
      await Promise.resolve()
    })

    expect(currentPhases[0].name).toBe('Second')
    expect(mockedPatchPhaseFields).toHaveBeenCalledTimes(2)

    await act(async () => {
      second.resolve({
        phases: [{ ...initialPhases[0], name: 'Second' }, initialPhases[1]],
        updatedAt: '2026-08-14T09:02:00Z',
      })
      await second.promise
      await Promise.resolve()
    })

    expect(currentPhases[0].name).toBe('Second')
    expect(setUpdatedAt).toHaveBeenLastCalledWith('2026-08-14T09:02:00Z')
  })

  it('keeps an optimistic phase field as a local draft when the connection result is ambiguous', async () => {
    mockedPatchPhaseFields.mockRejectedValue(
      new ApiConnectionError('Failed to reach RoadForge API'),
    )
    let currentPhases = initialPhases
    const setPhases = vi.fn((next: Phase[]) => {
      currentPhases = next
    })
    const setSaved = vi.fn()
    let result!: HookResult

    act(() => {
      root.render(
        <Harness
          phases={currentPhases}
          setPhases={setPhases}
          setSaved={setSaved}
          setUpdatedAt={vi.fn()}
          onResult={(next) => { result = next }}
        />,
      )
    })

    act(() => {
      result.patchSyncedPhase({ phaseId: 'phase-1', updates: { color: '#abcdef' } })
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(currentPhases[0].color).toBe('#abcdef')
    expect(setSaved).toHaveBeenCalledWith(false)
  })
})
