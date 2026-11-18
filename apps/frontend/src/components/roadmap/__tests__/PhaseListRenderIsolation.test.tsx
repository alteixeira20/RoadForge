// @vitest-environment jsdom

import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhaseList } from '@/components/roadmap/PhaseList'
import { KeyboardReorderCoordinatorProvider } from '@/hooks/useKeyboardReorderCoordinator'
import type { Phase } from '@/types/roadmap'

const { sortablePhaseRender } = vi.hoisted(() => ({
  sortablePhaseRender: vi.fn(),
}))

vi.mock('@/components/roadmap/SortablePhaseItem', () => ({
  SortablePhaseItem: () => {
    sortablePhaseRender()
    return <div data-testid="phase-item" />
  },
}))

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

function createProps(): ComponentProps<typeof PhaseList> {
  return {
    phases: [phase],
    openPhases: [phase.id],
    expandedTaskId: null,
    allTasks: [],
    readOnly: false,
    hasRoadmapPhases: true,
    totalPhaseCount: 1,
    isFiltering: false,
    emptyStateMessage: 'No tasks match.',
    onClearFilters: vi.fn(),
    onAddPhase: vi.fn(),
    phaseNameEditRequestId: null,
    onPhaseNameEditRequestHandled: vi.fn(),
    onTogglePhase: vi.fn(),
    onToggleTask: vi.fn(),
    onCheckTask: vi.fn(),
    pendingTaskDoneIds: new Set(),
    onUpdateTask: vi.fn(),
    onUpdatePhaseColor: vi.fn(),
    onUpdatePhaseColorMode: vi.fn(),
    onUpdatePhaseName: vi.fn(),
    onDeletePhase: vi.fn(),
    onAddTask: vi.fn(() => ''),
    onAddSubtask: vi.fn(),
    onLinkDependency: vi.fn(),
    onUnlinkDependency: vi.fn(),
    onReorderTasks: vi.fn(),
    onReorderSubtasks: vi.fn(),
    onDeleteSubtask: vi.fn(),
    onReorderPhases: vi.fn(),
    hasCycle: vi.fn(() => false),
    assignmentNames: [],
    onToast: vi.fn(),
  }
}

describe('PhaseList render isolation', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    sortablePhaseRender.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('does not rerender phase editors when a parent rerenders with unchanged props', () => {
    const props = createProps()

    act(() => {
      root.render(<KeyboardReorderCoordinatorProvider><PhaseList {...props} /></KeyboardReorderCoordinatorProvider>)
    })
    expect(sortablePhaseRender).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(<KeyboardReorderCoordinatorProvider><PhaseList {...props} /></KeyboardReorderCoordinatorProvider>)
    })
    expect(sortablePhaseRender).toHaveBeenCalledTimes(1)
  })
})
