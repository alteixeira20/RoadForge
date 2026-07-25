// @vitest-environment jsdom

import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhaseList } from '@/components/roadmap/PhaseList'
import { PhaseNameEditor } from '@/components/roadmap/PhaseNameEditor'
import { PhaseEmptyState } from '@/components/roadmap/Phase'
import { WorkspaceToolbar } from '@/components/roadmap/WorkspaceToolbar'
import type { Phase } from '@/types/roadmap'

vi.mock('@/components/roadmap/SortablePhaseItem', () => ({
  SortablePhaseItem: ({ phase }: { phase: Phase }) => (
    <div data-testid={`phase-${phase.id}`}>{phase.name}</div>
  ),
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

function createPhaseListProps(
  overrides: Partial<ComponentProps<typeof PhaseList>> = {},
): ComponentProps<typeof PhaseList> {
  return {
    phases: [],
    openPhases: [],
    expandedTaskId: null,
    allTasks: [],
    readOnly: false,
    hasRoadmapPhases: false,
    totalPhaseCount: 0,
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
    ...overrides,
  }
}

function createToolbarProps(
  overrides: Partial<ComponentProps<typeof WorkspaceToolbar>> = {},
): ComponentProps<typeof WorkspaceToolbar> {
  return {
    filterState: {
      query: '',
      status: 'all',
      assignees: [],
      tags: [],
      phaseIds: [],
      claim: 'all',
      recommended: false,
    },
    onFilterChange: vi.fn(),
    onClearFilters: vi.fn(),
    assignmentNames: [],
    tagIds: [],
    tagLabels: new Map(),
    phaseOptions: [{ id: phase.id, label: '01 Planning' }],
    workspaceView: 'roadmap',
    onWorkspaceViewChange: vi.fn(),
    allOpen: true,
    onCollapseAll: vi.fn(),
    onExpandAll: vi.fn(),
    onOpenActivity: vi.fn(),
    onOpenVersions: vi.fn(),
    hasServerActivity: false,
    canViewTeam: false,
    canViewVersions: false,
    canTogglePhaseExpansion: true,
    ...overrides,
  }
}

describe('phase creation controls', () => {
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

  it('offers first-phase recovery to editors', () => {
    const onAddPhase = vi.fn()
    act(() => {
      root.render(<PhaseList {...createPhaseListProps({ onAddPhase })} />)
    })

    const button = Array.from(container.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.includes('Create first phase'))
    expect(button).toBeInstanceOf(HTMLButtonElement)
    expect(button?.getAttribute('type')).toBe('button')
    act(() => button?.click())
    expect(onAddPhase).toHaveBeenCalledTimes(1)
  })

  it('explains zero-phase restrictions to viewers without an enabled action', () => {
    act(() => {
      root.render(
        <PhaseList {...createPhaseListProps({ readOnly: true })} />,
      )
    })

    expect(container.textContent).toContain('Viewers cannot create phases')
    expect(container.querySelector('button')).toBeNull()
  })

  it('keeps filtered-empty recovery separate from zero-phase recovery', () => {
    const onClearFilters = vi.fn()
    act(() => {
      root.render(
        <PhaseList
          {...createPhaseListProps({
            hasRoadmapPhases: true,
            isFiltering: true,
            onClearFilters,
          })}
        />,
      )
    })

    expect(container.textContent).toContain('No matching tasks')
    expect(container.textContent).toContain('Clear search and filters')
    expect(container.textContent).not.toContain('Create first phase')
    const clearButton = Array.from(container.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.includes('Clear search and filters'))
    act(() => clearButton?.click())
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('offers first-task recovery to editors and explains viewer restrictions', () => {
    const onAddTask = vi.fn()
    act(() => {
      root.render(<PhaseEmptyState readOnly={false} onAddTask={onAddTask} />)
    })
    const addButton = container.querySelector('button') as HTMLButtonElement
    expect(addButton.textContent).toContain('Add first task')
    expect(addButton.type).toBe('button')
    act(() => addButton.click())
    expect(onAddTask).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(<PhaseEmptyState readOnly={true} onAddTask={onAddTask} />)
    })
    expect(container.textContent).toContain('Viewers cannot add tasks')
    expect(container.querySelector('button')).toBeNull()
  })

  it('offers another phase after the final phase only to editors', () => {
    const onAddPhase = vi.fn()
    act(() => {
      root.render(
        <PhaseList
          {...createPhaseListProps({
            phases: [phase],
            hasRoadmapPhases: true,
            totalPhaseCount: 1,
            onAddPhase,
          })}
        />,
      )
    })

    const button = Array.from(container.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.includes('Add another phase'))
    expect(button).toBeInstanceOf(HTMLButtonElement)
    act(() => button?.click())
    expect(onAddPhase).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(
        <PhaseList
          {...createPhaseListProps({
            phases: [phase],
            hasRoadmapPhases: true,
            totalPhaseCount: 1,
            readOnly: true,
          })}
        />,
      )
    })
    expect(container.textContent).not.toContain('Add another phase')
  })

  it('keeps phase creation out of the toolbar and filters working', () => {
    act(() => {
      root.render(<WorkspaceToolbar {...createToolbarProps()} />)
    })

    // Creation lives after the phase list and in the zero state, not up here.
    expect(Array.from(container.querySelectorAll('button'))
      .some((candidate) => candidate.textContent?.includes('Add phase'))).toBe(false)

    const filterButton = Array.from(container.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.includes('Filters'))
    act(() => filterButton?.click())
    const filterDialog = document.body.querySelector('[role="dialog"][aria-label="Task filters"]')
    expect(filterDialog?.textContent).toContain('Choose phase...')
    expect(filterDialog?.classList.contains('anchored-overlay')).toBe(true)

    act(() => {
      root.render(
        <WorkspaceToolbar {...createToolbarProps()} />,
      )
    })
    expect(Array.from(container.querySelectorAll('button'))
      .some((candidate) => candidate.textContent?.includes('Add phase'))).toBe(false)
  })

  it('keeps the primary action and secondary controls truthful across role states', () => {
    act(() => {
      root.render(
        <WorkspaceToolbar
          {...createToolbarProps({
            workspaceView: 'team',
            canViewTeam: true,
            hasServerActivity: true,
            canViewVersions: true,
          })}
        />,
      )
    })
    // Team view keeps navigation only; exploration tools belong to Roadmap.
    expect(container.textContent).not.toContain('Add phase')
    expect(container.querySelector('input[aria-label="Search roadmap tasks"]')).toBeNull()
    expect(container.querySelector('.workspace-tools-row')).toBeNull()

    act(() => {
      root.render(
        <WorkspaceToolbar
          {...createToolbarProps({
            canTogglePhaseExpansion: false,
          })}
        />,
      )
    })
    const activity = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Activity')) as HTMLButtonElement
    expect(activity.getAttribute('aria-disabled')).toBe('true')
    expect(container.textContent).not.toContain('Collapse all')
    expect(container.textContent).not.toContain('Expand all')

    act(() => {
      root.render(
        <WorkspaceToolbar
          {...createToolbarProps({
            hasServerActivity: true,
          })}
        />,
      )
    })
    expect(container.textContent).not.toContain('Add phase')
    const viewerActivity = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Activity')) as HTMLButtonElement
    expect(viewerActivity.hasAttribute('aria-disabled')).toBe(false)
  })

  it('focuses phase-name editing when the rename key changes', async () => {
    const props: ComponentProps<typeof PhaseNameEditor> = {
      name: 'New phase',
      num: '02',
      isActive: false,
      isOpen: true,
      displayStatus: 'future',
      progressPercent: 0,
      doneCount: 0,
      taskCount: 0,
      renameKey: 0,
      onPhaseToggle: vi.fn(),
      onSave: vi.fn(),
    }
    act(() => {
      root.render(<PhaseNameEditor {...props} />)
    })

    await act(async () => {
      root.render(<PhaseNameEditor {...props} renameKey={1} />)
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    const input = container.querySelector('input')
    expect(input).toBeInstanceOf(HTMLInputElement)
    expect(document.activeElement).toBe(input)
  })
})
