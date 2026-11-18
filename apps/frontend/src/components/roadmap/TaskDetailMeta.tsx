'use client'

import { Icon } from '@/components/ui/Icon'
import { useTaskTagDisplayPreferences } from '@/hooks/useTaskTagDisplayPreferences'
import { resolveTagDisplay } from '@/lib/tag-registry'
import { getTaskComplexityLabel } from '@/lib/task-complexity'
import type { Task, TagDefinition } from '@/types/roadmap'
import { TagChip } from './TagChip'

interface TaskDetailMetaProps {
  task: Task
  isNested: boolean
  assignedNames: string[]
  visibleTags: string[]
  registry?: TagDefinition[]
}

export function TaskDetailMeta({
  task,
  isNested,
  assignedNames,
  visibleTags,
  registry = [],
}: TaskDetailMetaProps) {
  const {
    userTags,
    favoriteTagId,
    showAutomaticStatus,
    selectFavoriteTag,
    toggleAutomaticStatus,
  } = useTaskTagDisplayPreferences(task.id, visibleTags)

  return (
    <dl className="task-meta-stack">
      <div className="task-meta-group is-complexity">
        <dt className="task-meta-label">Complexity</dt>
        <dd className="task-meta-value">
          <span className="meta-pill complexity-pill">{getTaskComplexityLabel(task)}</span>
        </dd>
      </div>
      {!isNested && (
        <div className="task-meta-group is-estimate">
          <dt className="task-meta-label">Time estimate · heuristic</dt>
          <dd className="task-meta-value">
            {task.est
              ? <span className="estimate-chip">{task.est}</span>
              : <span className="task-meta-empty">No estimate</span>}
          </dd>
        </div>
      )}
      <div className="task-meta-group is-assignees">
        <dt className="task-meta-label">Assignees</dt>
        <dd className="task-meta-value assignees">
          {assignedNames.length > 0 ? (
            assignedNames.map((name) => (
              <span key={name} className="assignee-pill">{name}</span>
            ))
          ) : (
            <span className="task-meta-empty">None</span>
          )}
        </dd>
      </div>
      <div className="task-meta-group is-tags">
        <dt className="task-meta-label">Tags</dt>
        <dd className="task-meta-value tags task-tag-preferences">
          <button
            type="button"
            className={`automatic-tag-toggle${showAutomaticStatus ? ' selected' : ''}`}
            aria-pressed={showAutomaticStatus}
            onClick={toggleAutomaticStatus}
            title={showAutomaticStatus
              ? 'Hide the automatic status tag from this task header'
              : 'Show the automatic status tag in this task header'}
          >
            <Icon name={showAutomaticStatus ? 'eye' : 'eye-off'} size={12} />
            Auto status
          </button>
          {userTags.map((tagId) => {
            const selected = tagId === favoriteTagId
            const label = resolveTagDisplay(tagId, registry).label
            return (
              <button
                key={tagId}
                type="button"
                className={`favorite-tag-option${selected ? ' selected' : ''}`}
                aria-pressed={selected}
                aria-label={selected
                  ? `${label} is the featured task tag`
                  : `Feature ${label} beside the task title`}
                title={selected
                  ? 'Featured beside the task title'
                  : 'Show this tag beside the task title'}
                onClick={() => selectFavoriteTag(tagId)}
              >
                <TagChip tagId={tagId} registry={registry} />
                {selected && <Icon name="spark" size={11} />}
              </button>
            )
          })}
          {userTags.length === 0 && (
            <span className="task-meta-empty">No custom tags</span>
          )}
        </dd>
      </div>
    </dl>
  )
}
