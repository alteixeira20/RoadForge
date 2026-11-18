// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePhaseCollapse } from '@/hooks/usePhaseCollapse'
import { storage } from '@/lib/storage'
import type { Phase } from '@/types/roadmap'

const phases: Phase[] = [
  {
    id: 'rf-p-1',
    num: '01',
    name: 'Planning',
    color: '#76746e',
    colorMode: 'auto',
    status: 'active',
    progress: 0,
    tasks: [],
  },
  {
    id: 'rf-p-2',
    num: '02',
    name: 'Delivery',
    color: '#76746e',
    colorMode: 'auto',
    status: 'future',
    progress: 0,
    tasks: [],
  },
]

type CollapseState = ReturnType<typeof usePhaseCollapse>

function Harness({
  phases: phaseList,
  roadmapId = 'local-test',
  onReady,
}: {
  phases: Phase[]
  roadmapId?: string | null
  onReady: (state: CollapseState) => void
}) {
  onReady(usePhaseCollapse(phaseList, roadmapId))
  return null
}

describe('usePhaseCollapse', () => {
  let container: HTMLDivElement
  let root: Root
  let state: CollapseState | null

  beforeEach(() => {
    window.localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    state = null
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function currentState(): CollapseState {
    if (!state) throw new Error('Collapse harness did not initialize')
    return state
  }

  function renderHarness(phaseList: Phase[], roadmapId: string | null = 'local-test') {
    act(() => {
      root.render(
        <Harness
          phases={phaseList}
          roadmapId={roadmapId}
          onReady={(value) => { state = value }}
        />,
      )
    })
  }

  it('opens a new phase without closing existing phases and persists the result', () => {
    renderHarness(phases)
    expect(currentState().openPhases).toEqual(['rf-p-1'])

    act(() => currentState().openPhase('rf-p-2'))
    expect(currentState().openPhases).toEqual(['rf-p-1', 'rf-p-2'])

    act(() => currentState().openPhase('rf-p-2'))
    expect(currentState().openPhases).toEqual(['rf-p-1', 'rf-p-2'])
    expect(storage.getRoadmapUiState('local-test')?.openPhaseIds)
      .toEqual(['rf-p-1', 'rf-p-2'])
  })

  it('preserves deliberately collapsed phases when empty array is stored', () => {
    storage.setRoadmapUiState('local-test', {
      schemaVersion: 1,
      openPhaseIds: [],
      expandedTaskId: null,
      updatedAt: new Date().toISOString(),
    })

    renderHarness(phases)
    expect(currentState().openPhases).toEqual([])
    expect(currentState().allOpen).toBe(false)
  })

  it('preserves an empty list of expanded phases across remote phase additions', () => {
    renderHarness(phases)
    expect(currentState().openPhases).toEqual(['rf-p-1'])

    // User deliberately collapses all phases
    act(() => currentState().collapseAll())
    expect(currentState().openPhases).toEqual([])
    expect(storage.getRoadmapUiState('local-test')?.openPhaseIds).toEqual([])

    // Remote participant creates a third phase
    const updatedPhases: Phase[] = [
      ...phases,
      {
        id: 'rf-p-3',
        num: '03',
        name: 'Launch',
        color: '#76746e',
        colorMode: 'auto',
        status: 'next',
        progress: 0,
        tasks: [],
      },
    ]

    renderHarness(updatedPhases)

    // Remote phase creation must NOT automatically reopen panels
    expect(currentState().openPhases).toEqual([])
  })

  it('preserves collapsed state across remote task completion and synchronization', () => {
    renderHarness(phases)
    act(() => currentState().collapseAll())
    expect(currentState().openPhases).toEqual([])

    // Remote update updates task completion and progress
    const updatedPhases: Phase[] = [
      {
        ...phases[0],
        status: 'done',
        progress: 100,
        tasks: [{ id: 't1', title: 'Done task', done: true }],
      },
      phases[1],
    ]

    renderHarness(updatedPhases)

    // Ordinary synchronization must not automatically reopen user's panels
    expect(currentState().openPhases).toEqual([])
  })

  it('prunes deleted phase without reopening default phases', () => {
    renderHarness(phases)
    act(() => currentState().openPhase('rf-p-2'))
    expect(currentState().openPhases).toEqual(['rf-p-1', 'rf-p-2'])

    // Remote update deletes Phase 2
    renderHarness([phases[0]])
    expect(currentState().openPhases).toEqual(['rf-p-1'])

    // Remote update deletes Phase 1 as well
    renderHarness([])
    expect(currentState().openPhases).toEqual([])
  })
})
