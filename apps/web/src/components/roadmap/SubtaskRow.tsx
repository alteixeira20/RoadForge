'use client'

import { Icon } from '@/components/ui/Icon'
import type { Task } from '@/types/roadmap'

interface SubtaskRowProps {
  task: Task
  readOnly: boolean
  pendingTaskDoneIds: ReadonlySet<string>
  dragHandleProps?: Record<string, unknown>
  onCheck: (id: string) => void
  onDelete: (id: string) => void
  onMoveEarlier?: () => void
  onMoveLater?: () => void
  displayNumber?: string
}

export function SubtaskRow({
  task,
  readOnly,
  pendingTaskDoneIds,
  dragHandleProps,
  onCheck,
  onDelete,
  onMoveEarlier,
  onMoveLater,
  displayNumber,
}: SubtaskRowProps) {
  const isPending = pendingTaskDoneIds.has(task.id)
  const isEffectivelyReadOnly = readOnly || isPending
  const canDrag = !isEffectivelyReadOnly && Boolean(dragHandleProps)

  return (
    <div className={`subtask-row${task.done ? ' done' : ''}`}>
      <div
        className={`subtask-drag-handle${canDrag ? '' : ' disabled'}`}
        aria-hidden={!canDrag}
        {...(canDrag ? dragHandleProps : {})}
      >
        <Icon name="grip" size={12} />
      </div>
      <div
        className={`subtask-check${isEffectivelyReadOnly ? ' disabled' : ''}`}
        role="checkbox"
        aria-checked={task.done}
        aria-label={`Mark subtask "${task.title}" as ${task.done ? 'incomplete' : 'complete'}`}
        tabIndex={isEffectivelyReadOnly ? -1 : 0}
        onClick={() => { if (!isEffectivelyReadOnly) onCheck(task.id) }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!isEffectivelyReadOnly) onCheck(task.id) }
        }}
      />
      <span className="subtask-title">{task.title}</span>
      {displayNumber && <span className="task-num">{displayNumber}</span>}
      <span className="subtask-id">{task.id}</span>
      {onMoveEarlier && (
        <button
          type="button"
          className="subtask-move"
          aria-label={`Move subtask "${task.title}" earlier`}
          onClick={() => onMoveEarlier()}
        >
          <Icon name="chevron-up" size={12} />
        </button>
      )}
      {onMoveLater && (
        <button
          type="button"
          className="subtask-move"
          aria-label={`Move subtask "${task.title}" later`}
          onClick={() => onMoveLater()}
        >
          <Icon name="chevron-down" size={12} />
        </button>
      )}
      {!isEffectivelyReadOnly && (
        <button
          type="button"
          className="subtask-delete"
          title="Delete subtask"
          aria-label={`Delete subtask "${task.title}"`}
          onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  )
}
