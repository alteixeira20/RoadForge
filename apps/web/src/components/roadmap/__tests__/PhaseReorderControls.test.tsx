// @vitest-environment jsdom

import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhaseList } from '@/components/roadmap/PhaseList'
import type { Phase } from '@/types/roadmap'

vi.mock('@/context/RoadmapContext', () => ({
  useRoadmapSession: () => ({
    locks: {},
    serverRoadmapId: null,
    sessionToken: null,
    participantId: null,
  }),
}))

const MOVE_CONTROL_PATTERN = /move\s*(phase)?\s*(up|down|earlier|later)/i

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

describe('phase reorder controls', () => {
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
    act(() => root.render(<PhaseList {...createProps()} />))
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
    act(() => root.render(<PhaseList {...createProps()} />))

    const handles = Array.from(
      container.querySelectorAll('.phase-drag-handle'),
    ).map((handle) => handle.getAttribute('aria-label'))
    expect(handles).toEqual(['Reorder phase Planning', 'Reorder phase Delivery'])
  })

  it('gives viewers no drag handle and no phase settings menu', () => {
    act(() => root.render(<PhaseList {...createProps({ readOnly: true })} />))

    expect(container.querySelectorAll('.phase-drag-handle')).toHaveLength(0)
    expect(
      container.querySelector('button[aria-label="Phase settings for Planning"]'),
    ).toBeNull()
    expect(controlLabels().some((label) => MOVE_CONTROL_PATTERN.test(label))).toBe(false)
  })

  it('still expands and collapses a phase through the disclosure control', () => {
    const onTogglePhase = vi.fn()
    act(() => root.render(<PhaseList {...createProps({ onTogglePhase })} />))

    const expand = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand phase Planning"]',
    )
    expect(expand?.getAttribute('aria-expanded')).toBe('false')
    expect(expand?.querySelector('.chev')).not.toBeNull()
    act(() => expand!.click())
    expect(onTogglePhase).toHaveBeenCalledWith('rf-p-1')

    act(() => {
      root.render(<PhaseList {...createProps({ onTogglePhase, openPhases: ['rf-p-1'] })} />)
    })
    const collapse = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse phase Planning"]',
    )
    expect(collapse?.getAttribute('aria-expanded')).toBe('true')
    act(() => collapse!.click())
    expect(onTogglePhase).toHaveBeenCalledTimes(2)
  })
})
