'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useRoadmap } from '@/context/RoadmapContext'
import { dedupeNames, getTaskAssignees, getVisibleTaskTags } from '@/lib/task-assignment'
import { SubtaskForm, DependencyPicker } from './TaskActionForms'
import { TaskEditForm } from './TaskEditForm'
import { TaskDetailMeta } from './TaskDetailMeta'
import { TaskSubtaskList } from './TaskSubtaskList'
import { useEditLock } from '@/hooks/useEditLock'
import { useTaskClaim } from '@/hooks/useTaskClaim'
import {
  ensureRegistryForTagIds,
  resolveTagColor,
  resolveTagDisplay,
} from '@/lib/tag-registry'
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
  onUpdateTask: (id: string, updates: Partial<Task>) => void
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
  const [isEditing, setIsEditing] = useState(startEditing)
  const [editDirty, setEditDirty] = useState(false)

  const target = `task:${task.id}`
  const lock = locks[target]
  const lockHolderName = lock?.displayName || 'Another participant'
  const isTaskDonePending = pendingTaskDoneIds.has(task.id)

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!expanded) {
      setShowSubtaskForm(false)
      setShowDepPicker(false)
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

  // ─── Lock lifecycle ──────────────────────────────────────────────────────────

  const activeForm = isEditing || showSubtaskForm || showDepPicker

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

  const { ownsLock, isAcquiring, isReleasing, tryAcquire: tryAcquireLock } = useEditLock({
    target,
    active: activeForm && !readOnly,
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
    const confirmed = window.confirm(
      `Replace ${claimer ?? 'the current participant'}'s claim with yours?`,
    )
    if (confirmed) void handleClaim(true)
  }, [claimer, handleClaim])

  const isLockedByMe = ownsLock || (!!participantId && lock?.participantId === participantId)

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
  const isLockedByOther = Boolean(lock && !isLockedByMe && !hasLocalLockControl)
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

  const handleStartEdit = async () => {
    const success = await tryAcquireEditLock()
    if (!success) return
    setIsEditing(true)
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

  const depTasks = (task.deps ?? [])
    .map((id) => allTasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined)

  const blockedBy = depTasks.filter((d) => !d.done)

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
      <div className="task-row">
        <div
          className={`drag-handle ${canDragTask ? '' : 'disabled'}`}
          title={dragHandleTitle}
          aria-hidden={!canDragTask}
          {...(canDragTask ? dragHandleProps : {})}
        >
          <Icon name="grip" size={14} />
        </div>
        <div
          className={`check${effectivelyReadOnly ? ' task-check-disabled' : ''}`}
          aria-disabled={effectivelyReadOnly}
          title={checkTitle}
          onClick={(e) => {
            e.stopPropagation()
            if (!effectivelyReadOnly) onCheck(task.id)
          }}
        />
        <span className="title">{task.title}</span>
        {visibleTags.slice(0, 2).map((tagId) => (
          <span
            key={tagId}
            className="tag-pill task-row-tag"
            style={{ '--tag-bg': resolveTagColor(tagId, tagRegistry) } as CSSProperties}
          >
            {resolveTagDisplay(tagId, tagRegistry).label}
          </span>
        ))}
        {visibleTags.length > 2 && (
          <span className="meta-pill">+{visibleTags.length - 2}</span>
        )}
        {isLockedByOther && (
          <span className="meta-pill meta-pill-lock">
            <Icon name="shield" size={11} /> {lockHolderName} is editing
          </span>
        )}
        {claimer && !task.done && (
          <span className="meta-pill meta-pill-claim">
            <Icon name="user" size={11} /> {isClaimedByMe ? 'On it' : claimer}
          </span>
        )}
        {task.next && !task.done && <span className="next-pip">Recommended</span>}
        {blockedBy.length > 0 && (
          <span className="meta-pill blocked">⊘ Blocked</span>
        )}
        {task.est && blockedBy.length === 0 && !isNested && (
          <span className="meta-pill">{task.est}</span>
        )}
        {displayNumber && <span className="task-num">{displayNumber}</span>}
        <span className="id">{task.id}</span>
        <button
          type="button"
          className="toggle-btn"
          onClick={(e) => {
            e.stopPropagation()
            if (isEditing && editDirty) {
              onToast('Save or discard your edits first.')
              return
            }
            onToggle(task.id)
          }}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse task' : 'Expand task'}
        >
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
        </button>
      </div>

      {expanded && (
        <div className="task-detail" onClick={(e) => e.stopPropagation()}>
          {isEditing ? (
            <TaskEditForm
              task={task}
              isNested={isNested}
              availableAssignees={availableAssignees}
              registry={tagRegistry}
              onSave={(updates) => {
                if (updates.tags) {
                  const nextRegistry = ensureRegistryForTagIds(updates.tags, tagRegistry)
                  if (nextRegistry.length !== tagRegistry.length) {
                    setTagRegistry(nextRegistry)
                  }
                }
                onUpdateTask(task.id, updates)
                setIsEditing(false)
                setEditDirty(false)
                onToast('Task updated', 'success')
              }}
              onCancel={() => {
                setIsEditing(false)
                setEditDirty(false)
              }}
              onDirtyChange={setEditDirty}
            />
          ) : (
            <>
              <TaskDetailMeta
                task={task}
                isNested={isNested}
                assignedNames={assignedNames}
                visibleTags={visibleTags}
                registry={tagRegistry}
              />

              {depTasks.length > 0 && (
                <div className="task-detail-section">
                  <div className="section-label">Depends on</div>
                  <div className="deps">
                    {depTasks.map((d) => (
                      <div key={d.id} className="dep-row" onClick={() => navigateToTask(d.id)}>
                        <Icon
                          name={d.done ? 'circle-check' : 'circle'}
                          size={14}
                          stroke={d.done ? 'var(--ink-3)' : 'var(--ember)'}
                        />
                        <span className="title">{d.title}</span>
                        <span className="did">{d.id}</span>
                        <span className={`dst ${d.done ? 'done' : 'ready'}`}>
                          {d.done ? 'done' : 'ready'}
                        </span>
                        {!effectivelyReadOnly && (
                          <button
                            className="btn-remove"
                            onClick={(e) => {
                              e.stopPropagation()
                              onUnlinkDependency(task.id, d.id)
                              onToast('Dependency removed', 'success')
                            }}
                            title="Unlink dependency"
                          >
                            <Icon name="x" size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {subtasks.length > 0 && (
                <div className="task-detail-section">
                  <div className="section-label">Subtasks</div>
                  <div className="subtasks">
                    <TaskSubtaskList
                      parentId={task.id}
                      subtasks={subtasks}
                      readOnly={readOnly}
                      pendingTaskDoneIds={pendingTaskDoneIds}
                      onCheck={onCheck}
                      onDelete={onDeleteSubtask}
                      onReorder={onReorderSubtasks}
                      parentDisplayNumber={displayNumber}
                    />
                  </div>
                </div>
              )}

              {!isEditing && !task.done && (
                <div className="task-claim-row">
                  {claimer ? (
                    <>
                      <span className="claim-status">
                        <Icon name="user" size={13} />
                        {isClaimedByMe ? 'Working on this' : `${claimer} is working on this`}
                      </span>
                      {!readOnly && (isClaimedByMe || canOverrideClaim) && (
                        <button
                          type="button"
                          className="btn sm ghost claim-btn"
                          onClick={() => {
                            if (isClaimedByMe) void handleUnclaim()
                            else handleClaimOverride()
                          }}
                          disabled={isClaiming}
                          title={isClaimedByMe ? 'Stop working on this' : 'Owner override'}
                        >
                          {isClaimedByMe ? 'Stop working' : 'Override claim'}
                        </button>
                      )}
                    </>
                  ) : (
                    !readOnly && (
                      <button
                        type="button"
                        className="btn sm ghost claim-btn"
                        onClick={() => { void handleClaim() }}
                        disabled={isClaiming}
                        title="Claim this task as yours"
                      >
                        <Icon name="user" size={13} /> Work on this
                      </button>
                    )
                  )}
                </div>
              )}

              {!isEditing && (
                <div className="task-actions-footer">
                  {unavailableActionsMessage ? (
                    <div className="task-action-note">
                      <Icon name="shield" size={14} />
                      {unavailableActionsMessage}
                    </div>
                  ) : showSubtaskForm ? (
                    <SubtaskForm
                      onAdd={(title) => {
                        onAddSubtask(task.id, title)
                        setShowSubtaskForm(false)
                        onToast('Subtask added', 'success')
                      }}
                      onCancel={() => setShowSubtaskForm(false)}
                    />
                  ) : showDepPicker ? (
                    <DependencyPicker
                      currentTask={task}
                      allTasks={allTasks}
                      hasCycle={hasCycle}
                      onLink={(depId) => {
                        onLinkDependency(task.id, depId)
                        setShowDepPicker(false)
                        onToast('Dependency linked', 'success')
                      }}
                      onCancel={() => setShowDepPicker(false)}
                    />
                  ) : (
                    <div className="actions">
                      {!isNested && (
                        <button className="btn sm" onClick={async () => {
                          const success = await tryAcquireEditLock()
                          if (success) setShowSubtaskForm(true)
                        }}>
                          <Icon name="plus" size={13} /> Add subtask
                        </button>
                      )}
                      {!isNested && (
                        <button className="btn sm" onClick={async () => {
                          const success = await tryAcquireEditLock()
                          if (success) setShowDepPicker(true)
                        }}>
                          <Icon name="link" size={13} /> Link dependency
                        </button>
                      )}
                      <span className="spacer" />
                      <button className="iconbtn" onClick={handleStartEdit} title="Edit task">
                        <Icon name="pencil" size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
