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
  displayNumber?: string
}

export function SubtaskRow({
  task,
  readOnly,
  pendingTaskDoneIds,
  dragHandleProps,
  onCheck,
  onDelete,
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
        tabIndex={isEffectivelyReadOnly ? -1 : 0}
        onClick={() => { if (!isEffectivelyReadOnly) onCheck(task.id) }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!isEffectivelyReadOnly) onCheck(task.id) }
        }}
      />
      <span className="subtask-title">{task.title}</span>
      {displayNumber && <span className="task-num">{displayNumber}</span>}
      <span className="subtask-id">{task.id}</span>
      {!isEffectivelyReadOnly && (
        <button
          type="button"
          className="subtask-delete"
          title="Delete subtask"
          onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  )
}
