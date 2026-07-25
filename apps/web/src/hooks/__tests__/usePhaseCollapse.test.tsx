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

function Harness({ onReady }: { onReady: (state: CollapseState) => void }) {
  onReady(usePhaseCollapse(phases, 'local-test'))
  return null
}

describe('usePhaseCollapse openPhase', () => {
  let container: HTMLDivElement
  let root: Root
  let state: CollapseState | null

  beforeEach(() => {
    window.localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    state = null
    act(() => {
      root.render(<Harness onReady={(value) => { state = value }} />)
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function currentState(): CollapseState {
    if (!state) throw new Error('Collapse harness did not initialize')
    return state
  }

  it('opens a new phase without closing existing phases and persists the result', () => {
    expect(currentState().openPhases).toEqual(['rf-p-1'])

    act(() => currentState().openPhase('rf-p-2'))
    expect(currentState().openPhases).toEqual(['rf-p-1', 'rf-p-2'])

    act(() => currentState().openPhase('rf-p-2'))
    expect(currentState().openPhases).toEqual(['rf-p-1', 'rf-p-2'])
    expect(storage.getRoadmapUiState('local-test')?.openPhaseIds)
      .toEqual(['rf-p-1', 'rf-p-2'])
  })
})
