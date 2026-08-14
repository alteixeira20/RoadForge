// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePhasePatch } from '@/hooks/usePhasePatch'
import { patchPhaseFields } from '@/services/roadmap-structure.service'
import type { Phase } from '@/types/roadmap'

vi.mock('@/services/roadmap-structure.service', () => ({
  patchPhaseFields: vi.fn(),
}))

const mockedPatchPhaseFields = vi.mocked(patchPhaseFields)

const phase: Phase = {
  id: 'phase-new',
  num: '02',
  name: 'New phase',
  color: '#76746e',
  colorMode: 'auto',
  status: 'future',
  progress: 0,
  tasks: [],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

type Result = ReturnType<typeof usePhasePatch>

function Harness({
  waitForPhaseReady,
  setPhases,
  beginFocusedWrite,
  endFocusedWrite,
  onResult,
}: {
  waitForPhaseReady: () => Promise<'ready' | 'absent' | 'uncertain'>
  setPhases: (phases: Phase[]) => void
  beginFocusedWrite: () => void
  endFocusedWrite: () => void
  onResult: (result: Result) => void
}) {
  onResult(usePhasePatch({
    phases: [phase],
    setPhases,
    setSaved: vi.fn(),
    serverRoadmapId: 'rm_1',
    sessionToken: 'session-token',
    updatedAt: '2026-08-14T09:00:00Z',
    setUpdatedAt: vi.fn(),
    beginFocusedWrite,
    endFocusedWrite,
    waitForPhaseReady,
  }))
  return null
}

describe('usePhasePatch creation barrier', () => {
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

  it('updates the UI immediately but does not PATCH until phase creation is ready', async () => {
    const ready = deferred<'ready'>()
    mockedPatchPhaseFields.mockResolvedValueOnce({
      phases: [{ ...phase, name: 'Immediate rename' }],
      updatedAt: '2026-08-14T09:01:00Z',
    })
    let current = [phase]
    const setPhases = vi.fn((next: Phase[]) => { current = next })
    const beginFocusedWrite = vi.fn()
    const endFocusedWrite = vi.fn()
    let result!: Result

    act(() => {
      root.render(
        <Harness
          waitForPhaseReady={() => ready.promise}
          setPhases={setPhases}
          beginFocusedWrite={beginFocusedWrite}
          endFocusedWrite={endFocusedWrite}
          onResult={(next) => { result = next }}
        />,
      )
    })

    act(() => {
      expect(result.patchSyncedPhase({
        phaseId: 'phase-new',
        updates: { name: 'Immediate rename' },
      })).toBe(true)
    })

    expect(current[0].name).toBe('Immediate rename')
    expect(beginFocusedWrite).toHaveBeenCalledTimes(1)
    await act(async () => Promise.resolve())
    expect(mockedPatchPhaseFields).not.toHaveBeenCalled()

    await act(async () => {
      ready.resolve('ready')
      await ready.promise
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockedPatchPhaseFields).toHaveBeenCalledWith(
      'rm_1',
      'phase-new',
      { name: 'Immediate rename' },
      'session-token',
    )
    expect(endFocusedWrite).toHaveBeenCalledTimes(1)
  })
})
