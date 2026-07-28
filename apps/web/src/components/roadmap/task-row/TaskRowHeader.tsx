'use client'

import { Icon } from '@/components/ui/Icon'
import { TagChip } from '@/components/roadmap/TagChip'
import { useTaskTagDisplayPreferences } from '@/hooks/useTaskTagDisplayPreferences'
import {
  TASK_STATUS_LABELS,
  type DerivedTaskStatus,
} from '@/lib/task-display'
import type { TagDefinition, Task } from '@/types/roadmap'

interface TaskRowHeaderProps {
  task: Task
  expanded: boolean
  status: DerivedTaskStatus
  statusTitle: string
  visibleTags: string[]
  registry: TagDefinition[]
  lockedByOther: boolean
  lockHolderName: string
  showEstimate: boolean
  displayNumber?: string
  canDrag: boolean
  dragHandleTitle: string
  dragHandleProps?: Record<string, unknown>
  checkDisabled: boolean
  checkTitle?: string
  onCheck: () => void
  onToggle: () => void
}

export function TaskRowHeader({
  task,
  expanded,
  status,
  statusTitle,
  visibleTags,
  registry,
  lockedByOther,
  lockHolderName,
  showEstimate,
  displayNumber,
  canDrag,
  dragHandleTitle,
  dragHandleProps,
  checkDisabled,
  checkTitle,
  onCheck,
  onToggle,
}: TaskRowHeaderProps) {
  const {
    userTags,
    favoriteTagId,
    showAutomaticStatus,
  } = useTaskTagDisplayPreferences(task.id, visibleTags)
  const remainingTagCount = Math.max(
    0,
    userTags.length - (favoriteTagId ? 1 : 0),
  )

  return (
    <div className="task-row">
      <div
        className={`drag-handle ${canDrag ? '' : 'disabled'}`}
        title={dragHandleTitle}
        aria-hidden={!canDrag}
        {...(canDrag ? dragHandleProps : {})}
      >
        <Icon name="grip" size={14} />
      </div>
      <div
        role="checkbox"
        aria-checked={task.done}
        aria-label={`Mark task "${task.title}" as ${task.done ? 'incomplete' : 'complete'}`}
        tabIndex={checkDisabled ? -1 : 0}
        className={`check${checkDisabled ? ' task-check-disabled' : ''}`}
        aria-disabled={checkDisabled}
        title={checkTitle}
        onClick={(event) => {
          event.stopPropagation()
          if (!checkDisabled) onCheck()
        }}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault()
            event.stopPropagation()
            if (!checkDisabled) onCheck()
          }
        }}
      />
      <span className="title">{task.title}</span>
      {showAutomaticStatus && (
        <span
          className={`task-status-badge is-${status} is-automatic-tag`}
          title={`Automatic status: ${statusTitle}`}
        >
          {TASK_STATUS_LABELS[status]}
        </span>
      )}
      {favoriteTagId && (
        <TagChip
          tagId={favoriteTagId}
          registry={registry}
          className="task-row-tag is-favorite"
        />
      )}
      {remainingTagCount > 0 && (
        <span className="meta-pill">+{remainingTagCount}</span>
      )}
      {lockedByOther && (
        <span className="meta-pill meta-pill-lock">
          <Icon name="shield" size={11} /> {lockHolderName} is editing
        </span>
      )}
      {showEstimate && <span className="meta-pill">{task.est}</span>}
      {displayNumber && <span className="task-num">{displayNumber}</span>}
      <span className="id">{task.id}</span>
      <button
        type="button"
        className="toggle-btn"
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse task' : 'Expand task'}
      >
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
      </button>
    </div>
  )
}
