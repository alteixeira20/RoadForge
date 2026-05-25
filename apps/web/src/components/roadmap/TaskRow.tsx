'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useRoadmap } from '@/context/RoadmapContext'
import { dedupeNames, getTaskAssignees, getVisibleTaskTags } from '@/lib/task-assignment'
import { SubtaskForm, DependencyPicker } from './TaskActionForms'
import { TaskEditForm } from './TaskEditForm'
import { TaskDetailMeta } from './TaskDetailMeta'
import { useToastState } from '@/hooks/useToastState'
import { useEditLock } from '@/hooks/useEditLock'
import { Toast } from '@/components/ui/Toast'
import type { Task } from '@/types/roadmap'

interface TaskRowProps {
  task: Task
  allTasks: Task[]
  expanded: boolean
  expandedTaskId: string | null
  readOnly: boolean
  onToggle: (id: string) => void
  onCheck: (id: string) => void
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onAddTask: (phaseId: string) => void
  onAddSubtask: (parentId: string, title: string) => void
  onLinkDependency: (taskId: string, depId: string) => void
  onUnlinkDependency: (taskId: string, depId: string) => void
  onReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
  hasCycle: (taskId: string, depId: string) => boolean
  isNested?: boolean
  dragDisabled?: boolean
  dragHandleProps?: Record<string, unknown>
  assignmentNames: string[]
}

export function TaskRow({
  task,
  allTasks,
  expanded,
  expandedTaskId,
  readOnly,
  onToggle,
  onCheck,
  onUpdateTask,
  onAddTask: _onAddTask,
  onAddSubtask,
  onLinkDependency,
  onUnlinkDependency,
  onReorderSubtasks,
  hasCycle,
  isNested = false,
  dragDisabled = false,
  dragHandleProps,
  assignmentNames,
}: TaskRowProps) {
  const {
    displayName,
    locks,
    serverRoadmapId,
    sessionToken,
    participantId,
  } = useRoadmap()

  const [showSubtaskForm, setShowSubtaskForm] = useState(false)
  const [showDepPicker, setShowDepPicker] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const { toast, showToast } = useToastState()

  const target = `task:${task.id}`
  const lock = locks[target]
  const isLockedByMe = lock?.participantId === participantId
  const isLockedByOther = lock && !isLockedByMe
  const effectivelyReadOnly = readOnly || isLockedByOther

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!expanded) {
      setShowSubtaskForm(false)
      setShowDepPicker(false)
      setIsEditing(false)
    }
  }, [expanded])

  // ─── Lock lifecycle ──────────────────────────────────────────────────────────

  const activeForm = isEditing || showSubtaskForm || showDepPicker

  const lockRef = useRef(lock)
  lockRef.current = lock

  const handleEditLockError = useCallback((isConflict: boolean) => {
    if (isConflict) {
      const holder = lockRef.current?.displayName || 'Another participant'
      showToast(`${holder} is editing this task.`)
    } else {
      showToast('Could not acquire lock.')
    }
  }, [showToast])

  const { tryAcquire: tryAcquireLock } = useEditLock({
    target,
    active: activeForm && !readOnly,
    serverRoadmapId,
    sessionToken,
    onAcquireError: handleEditLockError,
  })

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

  const checkStyle: CSSProperties = effectivelyReadOnly
    ? { cursor: 'not-allowed', opacity: 0.6 }
    : {}

  // ─── Subtask Reordering ──────────────────────────────────────────────────
  // Subtask reordering is intentionally disabled for now.
  // If needed later, it should use the same dnd-kit sortable pattern as top-level tasks.
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
        {!effectivelyReadOnly && !expanded && (
          <div 
            className={`drag-handle ${dragDisabled ? 'disabled' : ''}`}
            title={dragDisabled ? "Collapse task to reorder" : "Drag to reorder"}
            {...dragHandleProps}
          >
            <Icon name="grip" size={14} />
          </div>
        )}
        <div
          className="check"
          style={checkStyle}
          onClick={(e) => {
            e.stopPropagation()
            if (!effectivelyReadOnly) onCheck(task.id)
          }}
        />
        <div className="title">{task.title}</div>
        {isLockedByOther && (
          <span className="meta-pill" style={{ color: 'var(--ink-3)', background: 'var(--ink-6)' }}>
            <Icon name="shield" size={11} /> {lock.displayName} is editing
          </span>
        )}
        {task.next && !task.done && <span className="next-pip">Next</span>}
        {blockedBy.length > 0 && (
          <span className="meta-pill blocked">⊘ Blocked</span>
        )}
        {task.est && blockedBy.length === 0 && !isNested && (
          <span className="meta-pill">{task.est}</span>
        )}
        <span className="id">{task.id}</span>
        <button
          type="button"
          className="toggle-btn"
          onClick={(e) => {
            e.stopPropagation()
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
              onSave={(updates) => {
                onUpdateTask(task.id, updates)
                setIsEditing(false)
              }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <>
              <TaskDetailMeta
                task={task}
                isNested={isNested}
                assignedNames={assignedNames}
                visibleTags={visibleTags}
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
                    {subtasks.map((st) => {
                      const isStExpanded = expandedTaskId === st.id
                      return (
                        <div
                          key={st.id}
                          className="draggable-task-wrapper"
                        >
                          <TaskRow
                            task={st}
                            allTasks={allTasks}
                            expanded={isStExpanded}
                            expandedTaskId={expandedTaskId}
                            readOnly={readOnly}
                            onToggle={onToggle}
                            onCheck={onCheck}
                            onUpdateTask={onUpdateTask}
                            onAddTask={_onAddTask}
                            onAddSubtask={onAddSubtask}
                            onLinkDependency={onLinkDependency}
                            onUnlinkDependency={onUnlinkDependency}
                            onReorderSubtasks={onReorderSubtasks}
                            hasCycle={hasCycle}
                            isNested
                            assignmentNames={assignmentNames}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {!effectivelyReadOnly && !isEditing && (
                <div className="task-actions-footer">
                  {showSubtaskForm ? (
                    <SubtaskForm
                      onAdd={(title) => {
                        onAddSubtask(task.id, title)
                        setShowSubtaskForm(false)
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
      {toast && <Toast message={toast} />}
    </div>
  )
}
