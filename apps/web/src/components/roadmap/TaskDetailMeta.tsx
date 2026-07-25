'use client'

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
  return (
    <dl className="task-meta-stack">
      {!isNested && (
        <div className="task-meta-group is-estimate">
          <dt className="task-meta-label">Estimate</dt>
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
        <dd className="task-meta-value tags">
          {visibleTags.length > 0
            ? visibleTags.map((tagId) => (
                <TagChip key={tagId} tagId={tagId} registry={registry} />
              ))
            : <span className="task-meta-empty">No tags</span>}
        </dd>
      </div>
    </dl>
  )
}
