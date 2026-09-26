// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncStatusIndicator } from '@/components/roadmap/SyncStatusIndicator'
import { TaskEditForm } from '@/components/roadmap/TaskEditForm'
import { usePhaseCollapse } from '@/hooks/usePhaseCollapse'
import { useToastState } from '@/hooks/useToastState'
import { storage } from '@/lib/storage'
import {
  getRoadmapUpgradeNoticeSignature,
  isRoadmapUpgradeNoticeDismissed,
  type RoadmapUpgradeNotice,
} from '@/lib/roadmap-upgrade'
import type { WorkspaceSyncStatus } from '@/lib/sync-status'
import type { Phase, Task } from '@/types/roadmap'

const initialPhases: Phase[] = [
  {
    id: 'p-1',
    num: '01',
    name: 'Foundation',
    color: '#76746e',
    colorMode: 'auto',
    status: 'active',
    progress: 0,
    tasks: [
      {
        id: 't-1',
        title: 'Initial task',
        done: false,
        complexity: 'medium',
      },
    ],
  },
  {
    id: 'p-2',
    num: '02',
    name: 'Iteration',
    color: '#76746e',
    colorMode: 'auto',
    status: 'future',
    progress: 0,
    tasks: [
      {
        id: 't-2',
        title: 'Future task',
        done: false,
        complexity: 'low',
      },
    ],
  },
]

describe('Collaboration UX Stability', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  describe('Phase expansion and panels stability', () => {
    function CollapseHarness({
      phases,
      onState,
    }: {
      phases: Phase[]
      onState: (state: ReturnType<typeof usePhaseCollapse>) => void
    }) {
      const state = usePhaseCollapse(phases, 'collab-test')
      onState(state)
      return null
    }

    it('preserves deliberately collapsed phases when remote phases are created or tasks synced', () => {
      let collapseState!: ReturnType<typeof usePhaseCollapse>
      const render = (phaseList: Phase[]) => {
        act(() => {
          root.render(<CollapseHarness phases={phaseList} onState={(s) => { collapseState = s }} />)
        })
      }

      render(initialPhases)
      expect(collapseState.openPhases).toEqual(['p-1'])

      // User collapses all phases
      act(() => {
        collapseState.collapseAll()
      })
      expect(collapseState.openPhases).toEqual([])

      // Remote update: another user adds phase 3 and completes task in phase 2
      const updatedPhases: Phase[] = [
        initialPhases[0],
        {
          ...initialPhases[1],
          tasks: [{ ...initialPhases[1].tasks[0], done: true }],
          progress: 100,
        },
        {
          id: 'p-3',
          num: '03',
          name: 'Launch',
          color: '#76746e',
          colorMode: 'auto',
          status: 'next',
          progress: 0,
          tasks: [],
        },
      ]

      render(updatedPhases)

      // Panels MUST stay collapsed
      expect(collapseState.openPhases).toEqual([])
    })

    it('preserves currently open phase when unrelated remote phase is added', () => {
      let collapseState!: ReturnType<typeof usePhaseCollapse>
      const render = (phaseList: Phase[]) => {
        act(() => {
          root.render(<CollapseHarness phases={phaseList} onState={(s) => { collapseState = s }} />)
        })
      }

      render(initialPhases)
      // Open phase 2 as well
      act(() => {
        collapseState.openPhase('p-2')
      })
      expect(collapseState.openPhases).toEqual(['p-1', 'p-2'])

      // Remote update adds phase 3
      const updatedPhases: Phase[] = [
        ...initialPhases,
        {
          id: 'p-3',
          num: '03',
          name: 'Operations',
          color: '#76746e',
          colorMode: 'auto',
          status: 'future',
          progress: 0,
          tasks: [],
        },
      ]

      render(updatedPhases)
      // Original open phases stay open, new remote phase is NOT auto-opened
      expect(collapseState.openPhases).toEqual(['p-1', 'p-2'])
    })
  })

  describe('Upgrade notice dismiss stability', () => {
    const notices: RoadmapUpgradeNotice[] = [
      {
        code: 'color_migration',
        message: 'Repaired phase color mode',
        severity: 'info',
      },
    ]

    it('keeps upgrade notice dismissed across routine saves that update updatedAt', () => {
      const initialSignature = getRoadmapUpgradeNoticeSignature({
        roadmapId: 'rm-collab',
        updatedAt: '2026-09-01T12:00:00Z',
        notices,
      })

      // User dismisses the notice
      storage.setDismissedUpgradeNoticeSignature('rm-collab', initialSignature)

      // Another user saves changes, advancing updatedAt
      const nextSignature = getRoadmapUpgradeNoticeSignature({
        roadmapId: 'rm-collab',
        updatedAt: '2026-09-01T12:05:00Z',
        notices,
      })

      const dismissed = storage.getRoadmapUiState('rm-collab')?.dismissedUpgradeNoticeSignature
      expect(isRoadmapUpgradeNoticeDismissed(dismissed, nextSignature)).toBe(true)
    })
  })

  describe('Active task editor stability during unrelated updates', () => {
    function TaskEditorHarness({
      task,
      onSave,
    }: {
      task: Task
      onSave: (updates: Partial<Task>) => void
    }) {
      return (
        <TaskEditForm
          task={task}
          isNested={false}
          directSubtaskCount={0}
          availableAssignees={['Alice', 'Bob']}
          onSave={onSave}
          onCancel={() => {}}
        />
      )
    }

    it('retains uncommitted input text and focus across unrelated roadmap updates', () => {
      let currentTask: Task = {
        id: 't-1',
        title: 'Original Title',
        done: false,
        desc: 'Initial description',
        complexity: 'medium',
      }
      const onSave = vi.fn()

      const render = (task: Task) => {
        act(() => {
          root.render(<TaskEditorHarness task={task} onSave={onSave} />)
        })
      }

      render(currentTask)

      const titleInput = container.querySelector<HTMLInputElement>(`#edit-title-${currentTask.id}`)!
      expect(titleInput).not.toBeNull()
      expect(titleInput.value).toBe('Original Title')

      // User types draft text
      act(() => {
        titleInput.focus()
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set
        nativeInputValueSetter?.call(titleInput, 'In-progress draft edit')
        titleInput.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(document.activeElement).toBe(titleInput)
      expect(titleInput.value).toBe('In-progress draft edit')

      // Unrelated remote update arrives (e.g. tag registry or other metadata changed on parent, passing new props)
      currentTask = { ...currentTask }
      render(currentTask)

      // Input must maintain draft value and DOM focus
      expect(titleInput.value).toBe('In-progress draft edit')
      expect(document.activeElement).toBe(titleInput)
    })
  })

  describe('Status indicator flicker suppression', () => {
    it('remains completely silent through rapid sequential saves and incoming updates', () => {
      function StatusHarness({ status }: { status: WorkspaceSyncStatus }) {
        return <SyncStatusIndicator status={status} />
      }

      const render = (status: WorkspaceSyncStatus) => {
        act(() => {
          root.render(<StatusHarness status={status} />)
        })
      }

      render('live')
      const indicator = container.querySelector('.sync-status-indicator')!
      expect(indicator.textContent).toBe('Live')

      // Background save 1 begins
      render('saving')
      act(() => { vi.advanceTimersByTime(400) })
      expect(indicator.textContent).toBe('Live')
      render('live')

      // Incoming update 1 arrives
      render('updating')
      act(() => { vi.advanceTimersByTime(300) })
      expect(indicator.textContent).toBe('Live')
      render('live')

      // Brief reconnect occurs
      render('reconnecting')
      act(() => { vi.advanceTimersByTime(500) })
      expect(indicator.textContent).toBe('Live')
      render('live')

      // Advance clock forward to ensure no delayed timers fire
      act(() => { vi.advanceTimersByTime(3000) })
      expect(indicator.textContent).toBe('Live')
    })
  })

  describe('Toast deduplication and severity', () => {
    function ToastHarness({ onHook }: { onHook: (h: ReturnType<typeof useToastState>) => void }) {
      const hook = useToastState()
      onHook(hook)
      return null
    }

    it('does not emit routine success toasts during collaboration, and deduplicates repeated alerts', () => {
      let toastHook!: ReturnType<typeof useToastState>
      act(() => {
        root.render(<ToastHarness onHook={(h) => { toastHook = h }} />)
      })

      // Normal collaboration updates do not call showToast
      expect(toastHook.toasts).toHaveLength(0)

      // A genuine persistent error arrives multiple times
      act(() => {
        toastHook.showToast('Could not reach the server.')
        toastHook.showToast('Could not reach the server.')
      })

      // Must be deduplicated into a single alert
      expect(toastHook.toasts).toHaveLength(1)
      expect(toastHook.toasts[0].tone).toBe('error')
    })
  })
})
