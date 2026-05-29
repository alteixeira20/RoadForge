'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditLock } from '@/hooks/useEditLock'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'

import React from 'react'
import { Icon } from '@/components/ui/Icon'
import { SortableTaskItem } from './SortableTaskItem'
import { TaskRow } from './TaskRow'
import { DraftTaskRow } from './DraftTaskRow'
import { useRoadmap } from '@/context/RoadmapContext'
import type { Phase as PhaseType, Task } from '@/types/roadmap'
import type { ForgeStyle } from '@/types/ui'

interface PhaseProps {
  phase: PhaseType
  isOpen: boolean
  onToggle: (id: string) => void
  expandedTaskId: string | null
  onToggleTask: (id: string) => void
  onCheckTask: (id: string) => void
  pendingTaskDoneIds: ReadonlySet<string>
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onUpdatePhaseColor: (phaseId: string, color: string) => void
  onAddTask: (phaseId: string, title?: string) => string
  onAddSubtask: (parentId: string, title: string) => void
  onLinkDependency: (taskId: string, depId: string) => void
  onUnlinkDependency: (taskId: string, depId: string) => void
  onReorderTasks: (phaseId: string, taskIds: string[]) => void
  onReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
  hasCycle: (taskId: string, depId: string) => boolean
  allTasks: Task[]
  readOnly: boolean
  assignmentNames: string[]
  onToast: (message: string) => void
  dragHandleProps?: React.HTMLAttributes<Element>
}

function phaseStatusLabel(status: PhaseType['status']): string {
  switch (status) {
    case 'done':   return 'Complete'
    case 'active': return 'In progress'
    case 'next':   return 'Up next'
    default:       return 'Future'
  }
}

const PHASE_COLOR_PRESETS = [
  { label: 'Orange', value: '#f97316' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Blue', value: '#38bdf8' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Slate', value: '#64748b' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Cyan', value: '#0ea5e9' },
]

export function Phase({
  phase,
  isOpen,
  onToggle,
  expandedTaskId,
  onToggleTask,
  onCheckTask,
  pendingTaskDoneIds,
  onUpdateTask,
  onUpdatePhaseColor,
  onAddTask,
  onAddSubtask,
  onLinkDependency,
  onUnlinkDependency,
  onReorderTasks,
  onReorderSubtasks,
  hasCycle,
  allTasks,
  readOnly,
  assignmentNames,
  onToast,
  dragHandleProps,
}: PhaseProps) {
  const doneCount = phase.tasks.filter((t) => t.done).length
  const allDone = doneCount === phase.tasks.length && phase.tasks.length > 0
  const isActive = phase.status === 'active'
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [hasDraft, setHasDraft] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)
  const [dirtyTaskId, setDirtyTaskId] = useState<string | null>(null)
  const [draftCreatedTaskId, setDraftCreatedTaskId] = useState<string | null>(null)
  const colorControlRef = useRef<HTMLDivElement | null>(null)

  const { locks, serverRoadmapId, sessionToken, participantId } = useRoadmap()

  const colorLockTarget = `phase:${phase.id}`
  const colorLock = locks[colorLockTarget]

  const colorLockRef = useRef(colorLock)
  colorLockRef.current = colorLock

  const handleColorLockError = useCallback((isConflict: boolean) => {
    if (isConflict) {
      const holder = colorLockRef.current?.displayName || 'Another participant'
      onToast(`${holder} is editing this phase.`)
    } else {
      onToast('Could not acquire lock.')
    }
  }, [onToast])

  const {
    ownsLock: ownsColorLock,
    tryAcquire: tryAcquireColorLock,
    release: releaseColorLock,
  } = useEditLock({
    target: colorLockTarget,
    active: showColorPicker && !readOnly,
    serverRoadmapId,
    sessionToken,
    onAcquireError: handleColorLockError,
  })

  const isColorLockedByMe = ownsColorLock || (!!participantId && colorLock?.participantId === participantId)
  const isColorLockedByOther = !!colorLock && !isColorLockedByMe

  const closeColorPicker = useCallback(() => {
    setShowColorPicker(false)
    void releaseColorLock()
  }, [releaseColorLock])

  const handleTryAcquireColorLock = async (): Promise<boolean> => {
    if (readOnly) return false
    return tryAcquireColorLock()
  }

  useEffect(() => {
    if (!showColorPicker) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && colorControlRef.current?.contains(target)) return
      closeColorPicker()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [showColorPicker, closeColorPicker])

  useEffect(() => {
    if (!isOpen && showColorPicker) closeColorPicker()
  }, [isOpen, showColorPicker, closeColorPicker])

  useEffect(() => {
    if (!isOpen && hasDraft) {
      setHasDraft(false)
      setDraftDirty(false)
    }
  }, [isOpen, hasDraft])

  const handleTaskDirtyChange = useCallback((taskId: string, dirty: boolean) => {
    setDirtyTaskId(dirty ? taskId : null)
  }, [])

  const handleToggleTask = useCallback((taskId: string) => {
    if (dirtyTaskId && taskId !== dirtyTaskId) {
      onToast('Save or discard your edits first.')
      return
    }
    onToggleTask(taskId)
  }, [dirtyTaskId, onToggleTask, onToast])

  const handlePhaseToggle = () => {
    if (dirtyTaskId) {
      onToast('Save or discard your edits first.')
      return
    }
    if (draftDirty) {
      onToast('Discard the draft task first.')
      return
    }
    onToggle(phase.id)
  }

  const handleOpenDraft = () => {
    if (!isOpen) onToggle(phase.id)
    setHasDraft(true)
  }

  const handleDraftConfirm = (title: string) => {
    const newId = onAddTask(phase.id, title)
    setHasDraft(false)
    setDraftDirty(false)
    if (newId) setDraftCreatedTaskId(newId)
  }

  const handleDraftDiscard = () => {
    setHasDraft(false)
    setDraftDirty(false)
  }

  useEffect(() => {
    if (draftCreatedTaskId) {
      const t = setTimeout(() => setDraftCreatedTaskId(null), 0)
      return () => clearTimeout(t)
    }
  }, [draftCreatedTaskId])

  const displayStatus = allDone ? 'done' : (phase.status === 'done' ? 'active' : phase.status)

  const headStyle: ForgeStyle = { '--phase-color': phase.color }
  const progressStyle: ForgeStyle = { '--p': `${phase.progress}%` }

  const topLevelTasks = phase.tasks.filter((t) => !t.parentId)
  const taskIds = topLevelTasks.map((t) => t.id)

  const isAnyTaskInPhaseExpanded = expandedTaskId !== null && phase.tasks.some(t => t.id === expandedTaskId)

  // ─── dnd-kit Setup ────────────────────────────────────────────────────────

  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (over && active.id !== over.id) {
      const oldIndex = taskIds.indexOf(active.id as string)
      const newIndex = taskIds.indexOf(over.id as string)
      const newOrder = arrayMove(taskIds, oldIndex, newIndex)
      onReorderTasks(phase.id, newOrder)
    }
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  const activeTask = activeId ? topLevelTasks.find((t) => t.id === activeId) : null

  return (
    <div
      className={[
        'phase',
        isOpen ? 'expanded' : '',
        isActive ? 'active-phase' : '',
        showColorPicker ? 'phase-color-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={headStyle}
    >
      <div className="phase-head" onClick={handlePhaseToggle}>
        {dragHandleProps && (
          <span
            className="phase-drag-handle"
            onClick={(e) => e.stopPropagation()}
            {...(dragHandleProps as React.HTMLAttributes<HTMLSpanElement>)}
          >
            <Icon name="grip" size={14} />
          </span>
        )}
        <span className="chev">
          <Icon name="chevron-right" size={16} />
        </span>
        <span className="num">{phase.num}</span>
        <span className="name">{phase.name}</span>
        <span className={`status ${isActive ? 'active' : ''}`}>
          {phaseStatusLabel(displayStatus)}
        </span>
        <span className="progress-mini" style={progressStyle}>
          <i />
        </span>
        <span className="count">
          {doneCount}/{phase.tasks.length}
        </span>
        {isColorLockedByOther && (
          <span className="phase-lock-pill">
            <Icon name="shield" size={11} /> {colorLock.displayName} is editing
          </span>
        )}
        {!readOnly && !isColorLockedByOther && (
          <div ref={colorControlRef} className="phase-color-control" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="phase-color-trigger"
              title="Change phase color"
              aria-label={`Change color for ${phase.name}`}
              aria-expanded={showColorPicker}
              onClick={async (e) => {
                e.stopPropagation()
                if (showColorPicker) {
                  closeColorPicker()
                  return
                }
                const success = await handleTryAcquireColorLock()
                if (success) setShowColorPicker(true)
              }}
            >
              <span style={{ backgroundColor: phase.color }} />
            </button>
            {showColorPicker && (
              <div className="phase-color-popover" role="menu" aria-label="Phase colors">
                {PHASE_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={preset.value.toLowerCase() === phase.color.toLowerCase() ? 'selected' : ''}
                    title={preset.label}
                    aria-label={preset.label}
                    onClick={() => {
                      onUpdatePhaseColor(phase.id, preset.value)
                      closeColorPicker()
                    }}
                  >
                    <span style={{ backgroundColor: preset.value }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isOpen && (
        <div className="phase-body">
          {topLevelTasks.length === 0 && !hasDraft ? (
            <div className="empty-phase">
              <p>No tasks yet.</p>
              {!readOnly && (
                <button className="btn sm ghost" onClick={handleOpenDraft}>
                  <Icon name="plus" size={13} /> Add first task
                </button>
              )}
            </div>
          ) : topLevelTasks.length === 0 && hasDraft ? (
            <div className="empty-phase-draft">
              <DraftTaskRow
                onConfirm={handleDraftConfirm}
                onDiscard={handleDraftDiscard}
                onDirtyChange={setDraftDirty}
              />
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            >
              <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                <div className="sortable-list">
                  {topLevelTasks.map((t) => (
                    <SortableTaskItem
                      key={t.id}
                      task={t}
                      allTasks={allTasks}
                      expanded={expandedTaskId === t.id}
                      expandedTaskId={expandedTaskId}
                      readOnly={readOnly}
                      dragDisabled={isAnyTaskInPhaseExpanded}
                      onToggle={handleToggleTask}
                      onCheck={onCheckTask}
                      pendingTaskDoneIds={pendingTaskDoneIds}
                      onUpdateTask={onUpdateTask}
                      onAddTask={onAddTask}
                      onAddSubtask={onAddSubtask}
                      onLinkDependency={onLinkDependency}
                      onUnlinkDependency={onUnlinkDependency}
                      onReorderSubtasks={onReorderSubtasks}
                      hasCycle={hasCycle}
                      onToast={onToast}
                      assignmentNames={assignmentNames}
                      startEditing={t.id === draftCreatedTaskId}
                      onDirtyChange={handleTaskDirtyChange}
                    />
                  ))}
                </div>
              </SortableContext>
              {hasDraft && (
                <DraftTaskRow
                  onConfirm={handleDraftConfirm}
                  onDiscard={handleDraftDiscard}
                  onDirtyChange={setDraftDirty}
                />
              )}
              <DragOverlay 
                dropAnimation={{ 
                  duration: 110,
                  easing: 'cubic-bezier(0.2, 0, 0, 1)',
                  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) 
                }}
              >
                {activeTask ? (
                  <div className="sortable-dragging-overlay">
                    <TaskRow
                      task={activeTask}
                      allTasks={allTasks}
                      expanded={false}
                      expandedTaskId={null}
                      readOnly={true}
                      dragDisabled={false}
                      onToggle={() => {}}
                      onCheck={() => {}}
                      pendingTaskDoneIds={pendingTaskDoneIds}
                      onUpdateTask={() => {}}
                      onAddTask={() => {}}
                      onAddSubtask={() => {}}
                      onLinkDependency={() => {}}
                      onUnlinkDependency={() => {}}
                      onReorderSubtasks={() => {}}
                      hasCycle={() => false}
                      onToast={onToast}
                      assignmentNames={assignmentNames}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {!readOnly && topLevelTasks.length > 0 && !hasDraft && (
            <div className="phase-foot">
              <button className="add-task-btn" onClick={handleOpenDraft}>
                <Icon name="plus" size={14} /> Add task
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
