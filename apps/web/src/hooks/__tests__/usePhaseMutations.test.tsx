// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePhaseMutations } from '@/hooks/usePhaseMutations'
import type { Phase } from '@/types/roadmap'

const phase: Phase = {
  id: 'rf-p-1',
  num: '01',
  name: 'Planning',
  color: '#76746e',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [],
}

const deliveryPhase: Phase = {
  ...phase,
  id: 'rf-p-2',
  num: '02',
  name: 'Delivery',
  status: 'future',
}

type MutationParams = Parameters<typeof usePhaseMutations>[0]
type Mutations = ReturnType<typeof usePhaseMutations>

function Harness({
  params,
  onReady,
}: {
  params: MutationParams
  onReady: (mutations: Mutations) => void
}) {
  onReady(usePhaseMutations(params))
  return null
}

describe('usePhaseMutations', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderMutations(overrides: Partial<MutationParams> = {}) {
    const params: MutationParams = {
      phases: [phase],
      setPhases: vi.fn(),
      setSaved: vi.fn(),
      readOnly: false,
      serverRoadmapId: 'roadmap-1',
      addPendingActivityChange: vi.fn(),
      ...overrides,
    }
    let mutations: Mutations | null = null
    act(() => {
      root.render(
        <Harness
          params={params}
          onReady={(value) => {
            mutations = value
          }}
        />,
      )
    })
    return {
      params,
      get mutations() {
        if (!mutations) throw new Error('Mutation harness did not initialize')
        return mutations
      },
    }
  }

  it('appends one phase, marks the roadmap unsaved, and records one activity event', () => {
    const harness = renderMutations()
    let phaseId: string | null = null

    act(() => {
      phaseId = harness.mutations.handleAddPhase()
    })

    expect(phaseId).toBe('rf-p-2')
    expect(harness.params.setPhases).toHaveBeenCalledTimes(1)
    expect(harness.params.setPhases).toHaveBeenCalledWith([
      phase,
      expect.objectContaining({ id: 'rf-p-2', num: '02', tasks: [] }),
    ])
    expect(harness.params.setSaved).toHaveBeenCalledWith(false)
    expect(harness.params.addPendingActivityChange).toHaveBeenCalledTimes(1)
    expect(harness.params.addPendingActivityChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'phase.created',
        entity_type: 'phase',
        entity_id: 'rf-p-2',
        phaseId: 'rf-p-2',
      }),
    )
  })

  it('recovers a zero-phase roadmap with an active first phase', () => {
    const harness = renderMutations({ phases: [] })

    act(() => {
      harness.mutations.handleAddPhase()
    })

    expect(harness.params.setPhases).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'rf-p-1',
        num: '01',
        status: 'active',
      }),
    ])
  })

  it('does nothing for viewers', () => {
    const harness = renderMutations({ readOnly: true })

    expect(harness.mutations.handleAddPhase()).toBeNull()
    expect(harness.params.setPhases).not.toHaveBeenCalled()
    expect(harness.params.setSaved).not.toHaveBeenCalled()
    expect(harness.params.addPendingActivityChange).not.toHaveBeenCalled()
  })

  it('records rename, color, and color-mode changes with useful metadata', () => {
    const rename = renderMutations()
    act(() => rename.mutations.handleUpdatePhaseName(phase.id, 'Discovery'))
    expect(rename.params.addPendingActivityChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'phase.updated',
        phaseId: phase.id,
        phaseField: 'name',
        previousValue: 'Planning',
        nextValue: 'Discovery',
      }),
    )

    const color = renderMutations()
    act(() => color.mutations.handleUpdatePhaseColor(phase.id, '#38bdf8'))
    expect(color.params.addPendingActivityChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'phase.updated',
        phaseId: phase.id,
        phaseField: 'color',
        previousValue: '#76746e',
        nextValue: '#38bdf8',
      }),
    )

    const mode = renderMutations()
    act(() => mode.mutations.handleUpdatePhaseColorMode(phase.id, 'manual'))
    expect(mode.params.addPendingActivityChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'phase.updated',
        phaseId: phase.id,
        phaseField: 'colorMode',
        previousValue: 'auto',
        nextValue: 'manual',
      }),
    )
  })

  it('records one reorder only for a changed, complete phase permutation', () => {
    const harness = renderMutations({ phases: [phase, deliveryPhase] })

    act(() => harness.mutations.handleReorderPhases([deliveryPhase.id, phase.id]))

    expect(harness.params.setPhases).toHaveBeenCalledWith([
      expect.objectContaining({ id: deliveryPhase.id, num: '01' }),
      expect.objectContaining({ id: phase.id, num: '02' }),
    ])
    expect(harness.params.addPendingActivityChange).toHaveBeenCalledTimes(1)
    expect(harness.params.addPendingActivityChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'phase.reordered',
        entity_type: 'roadmap',
        entity_id: 'roadmap-1',
      }),
    )

    const unchanged = renderMutations({ phases: [phase, deliveryPhase] })
    act(() => {
      unchanged.mutations.handleReorderPhases([phase.id, deliveryPhase.id])
      unchanged.mutations.handleReorderPhases([phase.id])
      unchanged.mutations.handleReorderPhases([phase.id, phase.id])
    })
    expect(unchanged.params.setPhases).not.toHaveBeenCalled()
    expect(unchanged.params.addPendingActivityChange).not.toHaveBeenCalled()
  })

  it('records deletion before renumbering and ignores a missing phase', () => {
    const harness = renderMutations({ phases: [phase, deliveryPhase] })
    act(() => harness.mutations.handleDeletePhase(phase.id))

    expect(harness.params.setPhases).toHaveBeenCalledWith([
      expect.objectContaining({ id: deliveryPhase.id, num: '01' }),
    ])
    expect(harness.params.addPendingActivityChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'phase.deleted',
        phaseId: phase.id,
        phaseNum: '01',
        phaseName: 'Planning',
      }),
    )

    const missing = renderMutations()
    act(() => missing.mutations.handleDeletePhase('missing'))
    expect(missing.params.setPhases).not.toHaveBeenCalled()
    expect(missing.params.addPendingActivityChange).not.toHaveBeenCalled()
  })

  it('does not emit activity or dirty the roadmap for no-op updates', () => {
    const harness = renderMutations()

    act(() => {
      harness.mutations.handleUpdatePhaseName(phase.id, phase.name)
      harness.mutations.handleUpdatePhaseColorMode(phase.id, 'auto')
      harness.mutations.handleUpdatePhaseColor('missing', '#38bdf8')
    })

    expect(harness.params.setPhases).not.toHaveBeenCalled()
    expect(harness.params.setSaved).not.toHaveBeenCalled()
    expect(harness.params.addPendingActivityChange).not.toHaveBeenCalled()
  })
})
