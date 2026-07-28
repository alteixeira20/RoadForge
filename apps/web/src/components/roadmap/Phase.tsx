'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditLock } from '@/hooks/useEditLock'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDndContext,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragEndEvent,
  MeasuringStrategy,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import {
  useCoordinatedKeyboardReorder,
  useKeyboardReorderCoordinator,
} from '@/hooks/useKeyboardReorderCoordinator'

import React from 'react'

// Collapsing a task changes its (and its siblings') rects with no drag in
// progress yet. The default `WhileDragging` strategy only remeasures once a
// drag has already started, so a keyboard drag initiated immediately after
// a collapse can briefly compute positions against stale rects. `Always`
// keeps droppable rects continuously current instead. Defined once at
// module scope so the object identity stays stable across renders.
const taskMeasuring = { droppable: { strategy: MeasuringStrategy.Always } }
import { Icon } from '@/components/ui/Icon'
import { PhaseHeader } from './PhaseHeader'
import { SortableTaskItem } from './SortableTaskItem'
import { TaskRow } from './TaskRow'
import { DraftTaskRow } from './DraftTaskRow'
import { useRoadmapSession } from '@/context/RoadmapContext'
import { computeTaskDisplayNumbers } from '@/lib/task-display'
import { getPhaseDisplayColor } from '@/lib/phase-color'
import type { ToastTone } from '@/hooks/useToastState'
import type { TaskUpdateHandler } from '@/hooks/taskMutationHelpers'
import type { Phase as PhaseType, Task } from '@/types/roadmap'
import type { ForgeStyle } from '@/types/ui'

interface PhaseProps {
  phase: PhaseType
  isOnlyPhase: boolean
  isOpen: boolean
  onToggle: (id: string) => void
  expandedTaskId: string | null
  onToggleTask: (id: string) => void
  onCheckTask: (id: string) => void
  pendingTaskDoneIds: ReadonlySet<string>
  onUpdateTask: TaskUpdateHandler
  onUpdatePhaseColor: (phaseId: string, color: string) => void
  onUpdatePhaseColorMode: (phaseId: string, mode: 'auto' | 'manual') => void
  onUpdatePhaseName: (phaseId: string, name: string) => void
  onDeletePhase: (phaseId: string) => void
  onAddTask: (phaseId: string, title?: string) => string
  onAddSubtask: (parentId: string, title: string) => void
  onLinkDependency: (taskId: string, depId: string) => void
  onUnlinkDependency: (taskId: string, depId: string) => void
  onReorderTasks: (phaseId: string, taskIds: string[]) => void
  onReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
  onDeleteSubtask: (subtaskId: string) => void
  hasCycle: (taskId: string, depId: string) => boolean
  allTasks: Task[]
  readOnly: boolean
  beginRename?: boolean
  onBeginRenameHandled?: () => void
  assignmentNames: string[]
  onToast: (message: string, tone?: ToastTone) => void
  dragHandleProps?: React.HTMLAttributes<Element>
}

export function Phase({
  phase,
  isOnlyPhase,
  isOpen,
  onToggle,
  expandedTaskId,
  onToggleTask,
  onCheckTask,
  pendingTaskDoneIds,
  onUpdateTask,
  onUpdatePhaseColor,
  onUpdatePhaseColorMode,
  onUpdatePhaseName,
  onDeletePhase,
  onAddTask,
  onAddSubtask,
  onLinkDependency,
  onUnlinkDependency,
  onReorderTasks,
  onReorderSubtasks,
  onDeleteSubtask,
  hasCycle,
  allTasks,
  readOnly,
  beginRename = false,
  onBeginRenameHandled,
  assignmentNames,
  onToast,
  dragHandleProps,
}: PhaseProps) {
  const doneCount = phase.tasks.filter((t) => t.done).length
  const allDone = doneCount === phase.tasks.length && phase.tasks.length > 0
  const isActive = phase.status === 'active'
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [renameKey, setRenameKey] = useState(0)
  const [hasDraft, setHasDraft] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)
  const [dirtyTaskId, setDirtyTaskId] = useState<string | null>(null)
  const [draftCreatedTaskId, setDraftCreatedTaskId] = useState<string | null>(null)
  const [isNameEditing, setIsNameEditing] = useState(false)
  const beginRenameHandledRef = useRef(false)

  const { locks, serverRoadmapId, sessionToken, participantId } = useRoadmapSession()

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
    isAcquiring: isAcquiringColorLock,
    isReleasing: isReleasingColorLock,
    tryAcquire: tryAcquireColorLock,
    release: releaseColorLock,
  } = useEditLock({
    target: colorLockTarget,
    active: (showColorPicker || isNameEditing) && !readOnly,
    serverRoadmapId,
    sessionToken,
    onAcquireError: handleColorLockError,
  })

  const isColorLockedByMe = ownsColorLock || (!!participantId && colorLock?.participantId === participantId)

  // Track whether this component instance has ever controlled the lock.
  // Set while acquiring/owning/releasing; cleared only once the server lock
  // entry disappears from context. This bridges the gap between ownsColorLock
  // dropping to false and the SSE lock-released event arriving, so a self-owned
  // lock never briefly renders as locked-by-other (which would unmount the
  // settings menu / color popover mid-edit). Mirrors TaskRow's bridge.
  const hadColorLockControlRef = useRef(false)
  if (ownsColorLock || isReleasingColorLock) {
    hadColorLockControlRef.current = true
  } else if (!colorLock && !isAcquiringColorLock) {
    hadColorLockControlRef.current = false
  }

  const hasLocalColorLockControl =
    isAcquiringColorLock || ownsColorLock || isReleasingColorLock || hadColorLockControlRef.current
  const isColorLockedByOther = Boolean(colorLock && !isColorLockedByMe && !hasLocalColorLockControl)

  const closeColorPicker = useCallback(() => {
    setShowColorPicker(false)
    void releaseColorLock()
  }, [releaseColorLock])

  const handleTryAcquireColorLock = async (): Promise<boolean> => {
    if (readOnly) return false
    return tryAcquireColorLock()
  }

  const handleNameBeforeEdit = useCallback(async (): Promise<boolean> => {
    if (readOnly || isColorLockedByOther) return false
    const ok = await tryAcquireColorLock()
    if (ok) setIsNameEditing(true)
    return ok
  }, [isColorLockedByOther, readOnly, tryAcquireColorLock])

  const handleNameSave = (name: string) => {
    onUpdatePhaseName(phase.id, name)
  }

  const handleColorTriggerClick = async () => {
    if (showColorPicker) {
      closeColorPicker()
      return
    }
    const success = await handleTryAcquireColorLock()
    if (success) setShowColorPicker(true)
  }

  const handleColorSelect = (color: string) => {
    onUpdatePhaseColor(phase.id, color)
    closeColorPicker()
  }

  const handleMenuRename = useCallback(async () => {
    const ok = await handleNameBeforeEdit()
    if (ok) setRenameKey((k) => k + 1)
  }, [handleNameBeforeEdit])

  useEffect(() => {
    if (!beginRename) {
      beginRenameHandledRef.current = false
      return
    }
    if (beginRenameHandledRef.current) return
    beginRenameHandledRef.current = true
    void handleMenuRename().finally(() => onBeginRenameHandled?.())
  }, [beginRename, handleMenuRename, onBeginRenameHandled])

  useEffect(() => {
    if (!isOpen && hasDraft) {
      setHasDraft(false)
      setDraftDirty(false)
    }
  }, [isOpen, hasDraft])

  // dnd-kit only auto-remeasures a droppable's rect via ResizeObserver while
  // a drag is active — collapsing a phase changes layout (this phase's and
  // its siblings') with no drag in progress, so nothing would normally pick
  // that up before the *next* drag starts. Ask the phase-level DndContext
  // (the nearest ancestor — SortablePhaseItem/PhaseList) to remeasure every
  // droppable as soon as this phase's open state actually changes, well
  // before a keyboard drag can begin.
  const { measureDroppableContainers } = useDndContext()
  useEffect(() => {
    measureDroppableContainers([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

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

  const displayStatus: PhaseType['status'] = allDone ? 'done' : (phase.status === 'done' ? 'active' : phase.status)
  const phaseDisplayColor = getPhaseDisplayColor(phase)
  const headStyle: ForgeStyle = { '--phase-color': phaseDisplayColor.color }

  const topLevelTasks = phase.tasks.filter((t) => !t.parentId)
  const taskIds = topLevelTasks.map((t) => t.id)

  const displayNumbers = computeTaskDisplayNumbers([phase])
  const isAnyTaskInPhaseExpanded = expandedTaskId !== null && phase.tasks.some(t => t.id === expandedTaskId)

  // ─── dnd-kit Setup ────────────────────────────────────────────────────────

  const [activeId, setActiveId] = useState<string | null>(null)
  const activeTaskDisplayNumber = activeId ? displayNumbers.get(activeId) : undefined

  const coordinator = useKeyboardReorderCoordinator()
  const keyboardReorder = useCoordinatedKeyboardReorder(`phase-tasks-${phase.id}`, taskIds, {
    disabled: readOnly || isAnyTaskInPhaseExpanded,
    itemLabel: (id) => `task ${topLevelTasks.find((t) => t.id === id)?.title ?? ''}`,
    onCommit: (orderedIds) => onReorderTasks(phase.id, orderedIds),
  })

  // Preview-then-commit (RF-034): render in preview order while a keyboard
  // reorder session targets this list, without mutating `phase.tasks` itself.
  const displayTaskIds = keyboardReorder.previewIds ?? taskIds
  const displayTasks = keyboardReorder.previewIds
    ? displayTaskIds
        .map((id) => topLevelTasks.find((t) => t.id === id))
        .filter((t): t is Task => t !== undefined)
    : topLevelTasks

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    // A pointer drag starting anywhere must pre-empt an in-progress
    // keyboard reorder session, even one targeting a different list.
    coordinator.cancelActive()
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
      ]
        .filter(Boolean)
        .join(' ')}
      style={headStyle}
    >
      <PhaseHeader
        phase={phase}
        isOnlyPhase={isOnlyPhase}
        isActive={isActive}
        isOpen={isOpen}
        displayStatus={displayStatus}
        doneCount={doneCount}
        readOnly={readOnly}
        isColorLockedByOther={isColorLockedByOther}
        colorLockDisplayName={colorLock?.displayName}
        showColorPicker={showColorPicker}
        dragHandleProps={dragHandleProps}
        onPhaseToggle={handlePhaseToggle}
        onNameSave={handleNameSave}
        onNameEditingChange={setIsNameEditing}
        renameKey={renameKey}
        onMenuRename={handleMenuRename}
        onColorTriggerClick={handleColorTriggerClick}
        onColorClose={closeColorPicker}
        onColorSelect={handleColorSelect}
        onColorModeSelect={(mode) => onUpdatePhaseColorMode(phase.id, mode)}
        colorReason={phaseDisplayColor.reason}
        displayColor={phaseDisplayColor.color}
        onDeletePhase={onDeletePhase}
      />

      {isOpen && (
        <div className="phase-body">
          {topLevelTasks.length === 0 && !hasDraft ? (
            <PhaseEmptyState readOnly={readOnly} onAddTask={handleOpenDraft} />
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
              id={`phase-tasks-${phase.id}`}
              sensors={sensors}
              collisionDetection={closestCenter}
              measuring={taskMeasuring}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            >
              <SortableContext items={displayTaskIds} strategy={verticalListSortingStrategy}>
                <div className="sortable-list">
                  {displayTasks.map((t) => (
                    <SortableTaskItem
                      key={t.id}
                      task={t}
                      allTasks={allTasks}
                      expanded={expandedTaskId === t.id}
                      expandedTaskId={expandedTaskId}
                      readOnly={readOnly}
                      dragDisabled={isAnyTaskInPhaseExpanded}
                      isKeyboardActive={keyboardReorder.activeId === t.id}
                      onKeyboardKeyDown={(event) => keyboardReorder.handleKeyDown(event, t.id)}
                      onKeyboardBlur={keyboardReorder.cancel}
                      onToggle={handleToggleTask}
                      onCheck={onCheckTask}
                      pendingTaskDoneIds={pendingTaskDoneIds}
                      onUpdateTask={onUpdateTask}
                      onAddTask={onAddTask}
                      onAddSubtask={onAddSubtask}
                      onLinkDependency={onLinkDependency}
                      onUnlinkDependency={onUnlinkDependency}
                      onReorderSubtasks={onReorderSubtasks}
                      onDeleteSubtask={onDeleteSubtask}
                      hasCycle={hasCycle}
                      onToast={onToast}
                      assignmentNames={assignmentNames}
                      startEditing={t.id === draftCreatedTaskId}
                      onDirtyChange={handleTaskDirtyChange}
                      displayNumber={displayNumbers.get(t.id)}
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
                      onDeleteSubtask={() => {}}
                      hasCycle={() => false}
                      onToast={onToast}
                      assignmentNames={assignmentNames}
                      displayNumber={activeTaskDisplayNumber}
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

export function PhaseEmptyState({
  readOnly,
  onAddTask,
}: {
  readOnly: boolean
  onAddTask: () => void
}) {
  return (
    <div className="empty-phase" role="status">
      <p>
        {readOnly
          ? 'No tasks yet. Viewers cannot add tasks.'
          : 'No tasks yet. Add the first task to start this phase.'}
      </p>
      {!readOnly && (
        <button type="button" className="btn sm ghost" onClick={onAddTask}>
          <Icon name="plus" size={13} /> Add first task
        </button>
      )}
    </div>
  )
}
