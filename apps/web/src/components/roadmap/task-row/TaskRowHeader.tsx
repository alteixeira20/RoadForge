'use client'

import type { CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { resolveTagColor, resolveTagDisplay } from '@/lib/tag-registry'
import {
  TASK_STATUS_LABELS,
  type DerivedTaskStatus,
} from '@/lib/task-display'
import type { TagDefinition, Task } from '@/types/roadmap'
import { TaskInlineField } from '../TaskInlineField'

interface TitleEditorProps {
  draft: string
  active: boolean
  editable: boolean
  busy: boolean
  canCommit: boolean
  error?: string
  onBegin: () => void
  onDraftChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  onInteraction: () => void
}

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
  titleEditor: TitleEditorProps
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
  titleEditor,
  onCheck,
  onToggle,
}: TaskRowHeaderProps) {
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
        className={`check${checkDisabled ? ' task-check-disabled' : ''}`}
        aria-disabled={checkDisabled}
        title={checkTitle}
        onClick={(event) => {
          event.stopPropagation()
          if (!checkDisabled) onCheck()
        }}
      />
      <TaskInlineField
        field="title"
        value={task.title}
        draft={titleEditor.draft}
        active={titleEditor.active}
        editable={titleEditor.editable}
        busy={titleEditor.busy}
        canCommit={titleEditor.canCommit}
        error={titleEditor.error}
        errorId={`${task.id}-title-error`}
        onBegin={titleEditor.onBegin}
        onDraftChange={titleEditor.onDraftChange}
        onCommit={titleEditor.onCommit}
        onCancel={titleEditor.onCancel}
        onInteraction={titleEditor.onInteraction}
      />
      <span className={`task-status-badge is-${status}`} title={statusTitle}>
        {TASK_STATUS_LABELS[status]}
      </span>
      {visibleTags.slice(0, 2).map((tagId) => (
        <span
          key={tagId}
          className="tag-pill task-row-tag"
          style={{ '--tag-bg': resolveTagColor(tagId, registry) } as CSSProperties}
        >
          {resolveTagDisplay(tagId, registry).label}
        </span>
      ))}
      {visibleTags.length > 2 && (
        <span className="meta-pill">+{visibleTags.length - 2}</span>
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
