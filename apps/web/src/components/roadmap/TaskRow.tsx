'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useRoadmap } from '@/context/RoadmapContext'
import { dedupeNames, getTaskAssignees, getVisibleTaskTags } from '@/lib/task-assignment'
import { SubtaskForm, DependencyPicker } from './TaskActionForms'
import { TaskEditForm } from './TaskEditForm'
import { TaskDetailMeta } from './TaskDetailMeta'
import { MarkdownDescription } from './MarkdownDescription'
import { TaskClaimRow } from './task-row/TaskClaimRow'
import { TaskDependencySection } from './task-row/TaskDependencySection'
import { TaskDetailActions } from './task-row/TaskDetailActions'
import { TaskLinksSection } from './task-row/TaskLinksSection'
import { TaskRowHeader } from './task-row/TaskRowHeader'
import { TaskSubtaskSection } from './task-row/TaskSubtaskSection'
import { useEditLock } from '@/hooks/useEditLock'
import { useIdleEditPause } from '@/hooks/useIdleEditPause'
import type { TaskUpdateHandler } from '@/hooks/taskMutationHelpers'
import { useTaskClaim } from '@/hooks/useTaskClaim'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ensureRegistryForTagIds } from '@/lib/tag-registry'
import { removeTaskLinkWithLock } from '@/lib/task-link-mutations'
import {
  deriveTaskStatus,
  getBlockingTasks,
  TASK_STATUS_LABELS,
} from '@/lib/task-display'
import type { ToastTone } from '@/hooks/useToastState'
import type { Task } from '@/types/roadmap'

interface TaskRowProps {
  task: Task
  allTasks: Task[]
  expanded: boolean
  expandedTaskId: string | null
  readOnly: boolean
  onToggle: (id: string) => void
  onCheck: (id: string) => void
  pendingTaskDoneIds: ReadonlySet<string>
  onUpdateTask: TaskUpdateHandler
  onAddTask: (phaseId: string) => void
  onAddSubtask: (parentId: string, title: string) => void
  onLinkDependency: (taskId: string, depId: string) => void
  onUnlinkDependency: (taskId: string, depId: string) => void
  onReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
  onDeleteSubtask: (subtaskId: string) => void
  hasCycle: (taskId: string, depId: string) => boolean
  onToast: (message: string, tone?: ToastTone) => void
  isNested?: boolean
  dragDisabled?: boolean
  dragHandleProps?: Record<string, unknown>
  assignmentNames: string[]
  startEditing?: boolean
  onDirtyChange?: (taskId: string, dirty: boolean) => void
  displayNumber?: string
}

export function TaskRow({
  task,
  allTasks,
  expanded,
  expandedTaskId: _expandedTaskId,
  readOnly,
  onToggle,
  onCheck,
  pendingTaskDoneIds,
  onUpdateTask,
  onAddTask: _onAddTask,
  onAddSubtask,
  onLinkDependency,
  onUnlinkDependency,
  onReorderSubtasks,
  onDeleteSubtask,
  hasCycle,
  onToast,
  isNested = false,
  dragDisabled = false,
  dragHandleProps,
  assignmentNames,
  startEditing = false,
  onDirtyChange,
  displayNumber,
}: TaskRowProps) {
  const {
    displayName,
    tagRegistry,
    setTagRegistry,
    locks,
    serverRoadmapId,
    sessionToken,
    participantId,
  } = useRoadmap()

  const [showSubtaskForm, setShowSubtaskForm] = useState(false)
  const [showDepPicker, setShowDepPicker] = useState(false)
  const [showGitHubLinkForm, setShowGitHubLinkForm] = useState(false)
  const [isEditing, setIsEditing] = useState(startEditing)
  const [editDirty, setEditDirty] = useState(false)
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false)

  const target = `task:${task.id}`
  const lock = locks[target]
  const knownLockHeldByOther = Boolean(
    lock && participantId && lock.participantId !== participantId,
  )
  const lockHolderName = lock?.displayName || 'Another participant'
  const isTaskDonePending = pendingTaskDoneIds.has(task.id)

  // ─── Lock lifecycle ──────────────────────────────────────────────────────────

  const activeForm = isEditing || showSubtaskForm || showDepPicker || showGitHubLinkForm
  const {
    isIdlePaused,
    recordInteraction,
    resumeEditing: markEditingResumed,
  } = useIdleEditPause({
    active: activeForm && !readOnly,
  })

  const lockRef = useRef(lock)
  lockRef.current = lock

  const handleEditLockError = useCallback((isConflict: boolean) => {
    if (isConflict) {
      const holder = lockRef.current?.displayName || 'Another participant'
      onToast(`${holder} is editing this task.`)
    } else {
      onToast('Could not acquire lock.')
    }
  }, [onToast])

  const {
    ownsLock,
    isAcquiring,
    isReleasing,
    tryAcquire: tryAcquireLock,
    release: releaseEditLock,
  } = useEditLock({
    target,
    active: activeForm && !readOnly && !isIdlePaused && !knownLockHeldByOther,
    serverRoadmapId,
    sessionToken,
    onAcquireError: handleEditLockError,
  })

  const {
    isClaiming,
    isClaimedByMe,
    canOverrideClaim,
    claimer,
    handleClaim,
    handleUnclaim,
  } = useTaskClaim({ task, showToast: onToast })

  const handleClaimOverride = useCallback(() => {
    setShowOverrideConfirm(true)
  }, [])

  const confirmClaimOverride = useCallback(() => {
    setShowOverrideConfirm(false)
    void handleClaim(true)
  }, [handleClaim])

  const isLockedByMe = !!participantId && lock?.participantId === participantId

  // Track whether this component instance has ever controlled the lock.
  // Set when acquiring/owning/releasing begins; cleared only once the server
  // lock entry disappears from context. This bridges the gap between
  // isReleasing dropping to false and the SSE lock-released event arriving.
  const hadLocalLockControlRef = useRef(false)
  if (ownsLock || isReleasing) {
    hadLocalLockControlRef.current = true
  } else if (!lock && !isAcquiring) {
    hadLocalLockControlRef.current = false
  }

  const hasLocalLockControl = isAcquiring || ownsLock || isReleasing || hadLocalLockControlRef.current
  const isLockedByOther = knownLockHeldByOther
    || Boolean(lock && !isLockedByMe && !hasLocalLockControl)
  const canCommitEdit = activeForm && ownsLock && !isIdlePaused && !isLockedByOther
  const resumeInFlightRef = useRef(false)

  useEffect(() => {
    if (!expanded) {
      setShowSubtaskForm(false)
      setShowDepPicker(false)
      setShowGitHubLinkForm(false)
      setIsEditing(false)
      setEditDirty(false)
      onDirtyChange?.(task.id, false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  useEffect(() => {
    onDirtyChange?.(task.id, editDirty)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDirty])

  const handleResumeEditing = useCallback(async () => {
    if (readOnly || resumeInFlightRef.current) return
    resumeInFlightRef.current = true
    try {
      await releaseEditLock()
      const acquired = await tryAcquireLock()
      if (acquired) markEditingResumed()
    } finally {
      resumeInFlightRef.current = false
    }
  }, [markEditingResumed, readOnly, releaseEditLock, tryAcquireLock])

  const handleEditorInteraction = useCallback(() => {
    if (!activeForm) return
    if (isIdlePaused || !ownsLock) {
      void handleResumeEditing()
      return
    }
    recordInteraction()
  }, [
    activeForm,
    handleResumeEditing,
    isIdlePaused,
    ownsLock,
    recordInteraction,
  ])
  const effectivelyReadOnly = readOnly || isLockedByOther || isTaskDonePending
  const canDragTask =
    !effectivelyReadOnly && !expanded && !dragDisabled && Boolean(dragHandleProps)
  let dragHandleTitle = 'Reordering unavailable'
  if (canDragTask) {
    dragHandleTitle = 'Drag to reorder'
  } else if (isLockedByOther) {
    dragHandleTitle = 'Reordering temporarily locked'
  } else if (readOnly) {
    dragHandleTitle = 'Reordering unavailable in read-only mode'
  } else if (expanded) {
    dragHandleTitle = 'Collapse task to reorder'
  }
  const unavailableActionsMessage = isLockedByOther
    ? `${lockHolderName} is editing this task. Actions are temporarily locked.`
    : readOnly
      ? 'Read-only view. Task actions are unavailable.'
      : null
  const checkTitle = isTaskDonePending
    ? 'Task update is saving'
    : effectivelyReadOnly
      ? 'Task check is unavailable'
      : undefined

  const tryAcquireEditLock = async (): Promise<boolean> => {
    if (readOnly) return false
    return tryAcquireLock()
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleOpenEditDetails = async () => {
    const success = await tryAcquireEditLock()
    if (success) setIsEditing(true)
  }

  const handleOpenSubtaskForm = async () => {
    const success = await tryAcquireEditLock()
    if (success) setShowSubtaskForm(true)
  }

  const handleOpenDependencyPicker = async () => {
    const success = await tryAcquireEditLock()
    if (success) setShowDepPicker(true)
  }

  const handleOpenGitHubLinkForm = async () => {
    const success = await tryAcquireEditLock()
    if (success) setShowGitHubLinkForm(true)
    return success
  }

  const navigateToTask = (id: string) => {
    const el = document.getElementById(`task-${id}`)
    if (el) {
      onToggle(id)
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('highlight-flash')
      setTimeout(() => el.classList.remove('highlight-flash'), 2000)
    }
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  const assignedNames = getTaskAssignees(task)
  const visibleTags = getVisibleTaskTags(task)
  const availableAssignees = dedupeNames([
    ...assignmentNames,
    ...assignedNames,
    displayName,
  ]).sort((a, b) => a.localeCompare(b))

  const taskStatus = deriveTaskStatus(task, allTasks)
  const blockedBy = getBlockingTasks(task, allTasks)
  const depTasks = (task.deps ?? [])
    .map((id) => allTasks.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Task => candidate !== undefined)
  const statusTitle = taskStatus === 'blocked'
    ? `Blocked by ${blockedBy.length} incomplete ${blockedBy.length === 1 ? 'dependency' : 'dependencies'}`
    : taskStatus === 'in-progress' && claimer
      ? `In progress — ${claimer}`
      : TASK_STATUS_LABELS[taskStatus]

  const subtasks = allTasks.filter((t) => t.parentId === task.id)

  return (
    <div
      id={`task-${task.id}`}
      className={[
        'task',
        expanded ? 'expanded' : '',
        task.done ? 'done' : '',
        task.next ? 'next' : '',
        isLockedByOther ? 'locked' : '',
        isNested ? 'nested' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <TaskRowHeader
        task={task}
        expanded={expanded}
        status={taskStatus}
        statusTitle={statusTitle}
        visibleTags={visibleTags}
        registry={tagRegistry}
        lockedByOther={isLockedByOther}
        lockHolderName={lockHolderName}
        showEstimate={Boolean(task.est && blockedBy.length === 0 && !isNested)}
        displayNumber={displayNumber}
        canDrag={canDragTask}
        dragHandleTitle={dragHandleTitle}
        dragHandleProps={dragHandleProps}
        checkDisabled={effectivelyReadOnly}
        checkTitle={checkTitle}
        onCheck={() => onCheck(task.id)}
        onToggle={() => {
          if (isEditing && editDirty) {
            onToast('Save or discard your edits first.')
            return
          }
          onToggle(task.id)
        }}
      />

      {expanded && (
        <div
          className="task-detail"
          onClick={(e) => e.stopPropagation()}
          onInputCapture={handleEditorInteraction}
          onKeyDownCapture={handleEditorInteraction}
          onPointerDownCapture={handleEditorInteraction}
        >
          {activeForm && !canCommitEdit && (
            <div className="edit-session-status" role="status" aria-live="polite">
              <span>
                {isIdlePaused
                  ? 'Editing paused after 90 seconds of inactivity. Your draft is still here.'
                  : 'Edit lock unavailable. Your draft is still here.'}
              </span>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => {
                  void handleResumeEditing()
                }}
                disabled={isAcquiring || isReleasing}
              >
                {isAcquiring || isReleasing
                  ? 'Reconnecting…'
                  : 'Resume editing'}
              </button>
            </div>
          )}
          {isEditing ? (
            <TaskEditForm
              task={task}
              isNested={isNested}
              availableAssignees={availableAssignees}
              registry={tagRegistry}
              onSave={async (updates) => {
                if (!canCommitEdit) return
                const isSyncedUpdate = Boolean(serverRoadmapId && sessionToken)
                const updateSucceeded = await onUpdateTask(task.id, updates)
                if (updateSucceeded === false) return
                if (!isSyncedUpdate && updates.tags) {
                  const nextRegistry = ensureRegistryForTagIds(updates.tags, tagRegistry)
                  if (nextRegistry.length !== tagRegistry.length) {
                    setTagRegistry(nextRegistry)
                  }
                }
                setIsEditing(false)
                setEditDirty(false)
                onToast('Task updated', 'success')
              }}
              onCancel={() => {
                setIsEditing(false)
                setEditDirty(false)
              }}
              onDirtyChange={setEditDirty}
              canCommit={canCommitEdit}
            />
          ) : (
            <>
              {task.desc && <MarkdownDescription value={task.desc} />}
              <TaskDetailMeta
                task={task}
                isNested={isNested}
                assignedNames={assignedNames}
                visibleTags={visibleTags}
                registry={tagRegistry}
              />

              <TaskLinksSection
                task={task}
                readOnly={effectivelyReadOnly}
                adding={showGitHubLinkForm}
                canCommit={canCommitEdit}
                onBeginAdd={handleOpenGitHubLinkForm}
                onCancelAdd={() => setShowGitHubLinkForm(false)}
                onUpdateLinks={async (links) => {
                  if (showGitHubLinkForm && !canCommitEdit) return false
                  return (await onUpdateTask(task.id, { links })) !== false
                }}
                onRemoveLink={(linkId) => removeTaskLinkWithLock({
                  links: task.links ?? [],
                  linkId,
                  acquireLock: tryAcquireEditLock,
                  releaseLock: releaseEditLock,
                  onUpdateLinks: async (links) => (
                    (await onUpdateTask(task.id, { links })) !== false
                  ),
                })}
              />

              <div
                className={`task-action-area${showSubtaskForm || showDepPicker ? ' has-form' : ''}`}
              >
                {showSubtaskForm ? (
                  <SubtaskForm
                    canCommit={canCommitEdit}
                    onAdd={(title) => {
                      if (!canCommitEdit) return
                      onAddSubtask(task.id, title)
                      setShowSubtaskForm(false)
                      onToast('Subtask added', 'success')
                    }}
                    onCancel={() => setShowSubtaskForm(false)}
                  />
                ) : showDepPicker ? (
                  <DependencyPicker
                    canCommit={canCommitEdit}
                    currentTask={task}
                    allTasks={allTasks}
                    hasCycle={hasCycle}
                    onLink={(depId) => {
                      if (!canCommitEdit) return
                      onLinkDependency(task.id, depId)
                      setShowDepPicker(false)
                      onToast('Dependency linked', 'success')
                    }}
                    onCancel={() => setShowDepPicker(false)}
                  />
                ) : unavailableActionsMessage ? (
                  <div className="task-action-note">
                    <Icon name="shield" size={14} />
                    {unavailableActionsMessage}
                  </div>
                ) : (
                  <TaskDetailActions
                    showChildActions={!isNested}
                    onEditDetails={() => { void handleOpenEditDetails() }}
                    onAddSubtask={() => { void handleOpenSubtaskForm() }}
                    onLinkDependency={() => { void handleOpenDependencyPicker() }}
                  />
                )}
              </div>

              <TaskDependencySection
                dependencies={depTasks}
                readOnly={effectivelyReadOnly}
                onNavigate={navigateToTask}
                onUnlink={(dependencyId) => {
                  onUnlinkDependency(task.id, dependencyId)
                  onToast('Dependency removed', 'success')
                }}
              />

              <TaskSubtaskSection
                parentId={task.id}
                subtasks={subtasks}
                readOnly={readOnly}
                pendingTaskDoneIds={pendingTaskDoneIds}
                onCheck={onCheck}
                onDelete={onDeleteSubtask}
                onReorder={onReorderSubtasks}
                parentDisplayNumber={displayNumber}
              />

              {!isEditing && !task.done && (
                <TaskClaimRow
                  claimer={claimer}
                  claimedByMe={isClaimedByMe}
                  readOnly={readOnly}
                  canOverride={canOverrideClaim}
                  isClaiming={isClaiming}
                  onClaim={() => { void handleClaim() }}
                  onClaimAction={() => {
                    if (isClaimedByMe) void handleUnclaim()
                    else handleClaimOverride()
                  }}
                />
              )}

            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showOverrideConfirm}
        title="Override claim?"
        message={`Replace ${claimer ?? 'the current participant'}'s claim with yours?`}
        confirmLabel="Override claim"
        tone="danger"
        loading={isClaiming}
        onConfirm={confirmClaimOverride}
        onClose={() => setShowOverrideConfirm(false)}
      />
    </div>
  )
}
