// @vitest-environment jsdom

import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhaseList } from '@/components/roadmap/PhaseList'
import { KeyboardReorderCoordinatorProvider } from '@/hooks/useKeyboardReorderCoordinator'
import { SubtaskRow } from '@/components/roadmap/SubtaskRow'
import { TaskRowHeader } from '@/components/roadmap/task-row/TaskRowHeader'
import type { Phase, Task } from '@/types/roadmap'

vi.mock('@/context/RoadmapContext', () => ({
  useRoadmapSession: () => ({
    locks: {},
    serverRoadmapId: null,
    sessionToken: null,
    participantId: null,
  }),
}))

const MOVE_CONTROL_PATTERN = /move(?:\s+\w+)*\s+(up|down|earlier|later)/i

const task: Task = {
  id: 'rf-t-1',
  title: 'Draft release notes',
  done: false,
  tags: [],
}

const subtask: Task = {
  id: 'rf-st-1',
  title: 'Confirm screenshots',
  done: false,
  parentId: task.id,
}

const phases: Phase[] = [
  {
    id: 'rf-p-1',
    num: '01',
    name: 'Planning',
    color: '#ef4444',
    colorMode: 'auto',
    status: 'active',
    progress: 0,
    tasks: [],
  },
  {
    id: 'rf-p-2',
    num: '02',
    name: 'Delivery',
    color: '#38bdf8',
    colorMode: 'auto',
    status: 'next',
    progress: 0,
    tasks: [],
  },
]

function createProps(
  overrides: Partial<ComponentProps<typeof PhaseList>> = {},
): ComponentProps<typeof PhaseList> {
  return {
    phases,
    openPhases: [],
    expandedTaskId: null,
    allTasks: [],
    readOnly: false,
    hasRoadmapPhases: true,
    totalPhaseCount: phases.length,
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

function controlLabels(): string[] {
  return Array.from(document.body.querySelectorAll('button, [role="menuitem"]')).map(
    (control) => [
      control.textContent ?? '',
      control.getAttribute('aria-label') ?? '',
      control.getAttribute('title') ?? '',
    ].join(' '),
  )
}

describe('drag-only roadmap ordering controls', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('renders no phase move-up or move-down control, in the header or its menu', () => {
    act(() => root.render(<KeyboardReorderCoordinatorProvider><PhaseList {...createProps()} /></KeyboardReorderCoordinatorProvider>))
    expect(controlLabels().some((label) => MOVE_CONTROL_PATTERN.test(label))).toBe(false)

    for (const phase of phases) {
      const trigger = container.querySelector<HTMLButtonElement>(
        `button[aria-label="Phase settings for ${phase.name}"]`,
      )
      expect(trigger).not.toBeNull()
      act(() => trigger!.click())
      expect(document.body.querySelector('[role="menu"]')).not.toBeNull()
      expect(controlLabels().some((label) => MOVE_CONTROL_PATTERN.test(label))).toBe(false)
      act(() => trigger!.click())
    }
  })

  it('keeps a drag handle on every phase for editable roles', () => {
    act(() => root.render(<KeyboardReorderCoordinatorProvider><PhaseList {...createProps()} /></KeyboardReorderCoordinatorProvider>))

    const handles = Array.from(
      container.querySelectorAll('.phase-drag-handle'),
    ).map((handle) => handle.getAttribute('aria-label'))
    expect(handles).toEqual(['Reorder phase Planning', 'Reorder phase Delivery'])
  })

  it('gives viewers no drag handle and no phase settings menu', () => {
    act(() => root.render(<KeyboardReorderCoordinatorProvider><PhaseList {...createProps({ readOnly: true })} /></KeyboardReorderCoordinatorProvider>))

    expect(container.querySelectorAll('.phase-drag-handle')).toHaveLength(0)
    expect(
      container.querySelector('button[aria-label="Phase settings for Planning"]'),
    ).toBeNull()
    expect(controlLabels().some((label) => MOVE_CONTROL_PATTERN.test(label))).toBe(false)
  })

  it('still expands and collapses a phase through the disclosure control', () => {
    const onTogglePhase = vi.fn()
    act(() => root.render(<KeyboardReorderCoordinatorProvider><PhaseList {...createProps({ onTogglePhase })} /></KeyboardReorderCoordinatorProvider>))

    const expand = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand phase Planning"]',
    )
    expect(expand?.getAttribute('aria-expanded')).toBe('false')
    expect(expand?.querySelector('.chev')).not.toBeNull()
    act(() => expand!.click())
    expect(onTogglePhase).toHaveBeenCalledWith('rf-p-1')

    act(() => {
      root.render(<KeyboardReorderCoordinatorProvider><PhaseList {...createProps({ onTogglePhase, openPhases: ['rf-p-1'] })} /></KeyboardReorderCoordinatorProvider>)
    })
    const collapse = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse phase Planning"]',
    )
    expect(collapse?.getAttribute('aria-expanded')).toBe('true')
    act(() => collapse!.click())
    expect(onTogglePhase).toHaveBeenCalledTimes(2)
  })

  it('keeps task drag and disclosure controls without move buttons', () => {
    const onToggle = vi.fn()
    act(() => {
      root.render(
        <TaskRowHeader
          task={task}
          expanded={false}
          status="ready"
          statusTitle="Ready"
          visibleTags={[]}
          registry={[]}
          lockedByOther={false}
          lockHolderName=""
          showEstimate={false}
          canDrag
          dragHandleTitle="Drag to reorder"
          dragHandleProps={{
            role: 'button',
            tabIndex: 0,
            'aria-label': `Reorder task ${task.title}`,
          }}
          checkDisabled={false}
          onCheck={vi.fn()}
          onToggle={onToggle}
        />,
      )
    })

    expect(
      container.querySelector(`[aria-label="Reorder task ${task.title}"]`),
    ).not.toBeNull()
    expect(controlLabels().some((label) => MOVE_CONTROL_PATTERN.test(label))).toBe(false)

    const disclosure = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand task"]',
    )
    expect(disclosure?.getAttribute('aria-expanded')).toBe('false')
    act(() => disclosure!.click())
    expect(onToggle).toHaveBeenCalledOnce()

    act(() => {
      root.render(
        <TaskRowHeader
          task={task}
          expanded={false}
          status="ready"
          statusTitle="Ready"
          visibleTags={[]}
          registry={[]}
          lockedByOther={false}
          lockHolderName=""
          showEstimate={false}
          canDrag={false}
          dragHandleTitle="Reordering unavailable in read-only mode"
          dragHandleProps={{
            role: 'button',
            tabIndex: 0,
            'aria-label': `Reorder task ${task.title}`,
          }}
          checkDisabled
          onCheck={vi.fn()}
          onToggle={onToggle}
        />,
      )
    })
    expect(container.querySelector('.drag-handle')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.drag-handle[role="button"]')).toBeNull()
    expect(controlLabels().some((label) => MOVE_CONTROL_PATTERN.test(label))).toBe(false)
  })

  it('keeps subtask drag behavior without move controls or move-button slots', () => {
    act(() => {
      root.render(
        <SubtaskRow
          task={subtask}
          readOnly={false}
          pendingTaskDoneIds={new Set()}
          dragHandleProps={{
            role: 'button',
            tabIndex: 0,
            'aria-label': `Reorder subtask ${subtask.title}`,
          }}
          onCheck={vi.fn()}
          onDelete={vi.fn()}
          displayNumber="01.1.1"
        />,
      )
    })

    expect(
      container.querySelector(`[aria-label="Reorder subtask ${subtask.title}"]`),
    ).not.toBeNull()
    expect(container.querySelector('.subtask-move')).toBeNull()
    expect(controlLabels().some((label) => MOVE_CONTROL_PATTERN.test(label))).toBe(false)

    act(() => {
      root.render(
        <SubtaskRow
          task={subtask}
          readOnly
          pendingTaskDoneIds={new Set()}
          onCheck={vi.fn()}
          onDelete={vi.fn()}
          displayNumber="01.1.1"
        />,
      )
    })
    expect(container.querySelector('.subtask-drag-handle')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.subtask-drag-handle[role="button"]')).toBeNull()
    expect(controlLabels().some((label) => MOVE_CONTROL_PATTERN.test(label))).toBe(false)
  })
})
