'use client'

import { type CSSProperties } from 'react'
import type { Task, TagDefinition } from '@/types/roadmap'
import { resolveTagColor, resolveTagDisplay } from '@/lib/tag-registry'
import { MarkdownDescription } from './MarkdownDescription'

interface TaskDetailMetaProps {
  task: Task
  isNested: boolean
  assignedNames: string[]
  visibleTags: string[]
  registry?: TagDefinition[]
  showDescription?: boolean
}

export function TaskDetailMeta({
  task,
  isNested,
  assignedNames,
  visibleTags,
  registry = [],
  showDescription = true,
}: TaskDetailMetaProps) {
  return (
    <>
      {showDescription && task.desc && <MarkdownDescription value={task.desc} />}

      <div className="task-meta-stack">
        {!isNested && (
          <div className="task-meta-group is-estimate">
            <span className="task-meta-label">Estimate</span>
            <div className="task-meta-value">
              <span className={`estimate-chip${task.est ? '' : ' is-empty'}`}>
                {task.est || 'No estimate'}
              </span>
            </div>
          </div>
        )}
        <div className="task-meta-group is-assignees">
          <span className="task-meta-label">Assignees</span>
          <div className="task-meta-value assignees">
            {assignedNames.length > 0 ? (
              assignedNames.map((name) => (
                <span key={name} className="assignee-pill">{name}</span>
              ))
            ) : (
              <span className="task-meta-empty">None</span>
            )}
          </div>
        </div>
        <div className="task-meta-group is-tags">
          <span className="task-meta-label">Tags</span>
          <div className="task-meta-value tags">
            {visibleTags.length > 0
              ? visibleTags.map((tagId) => {
                  const { label } = resolveTagDisplay(tagId, registry)
                  const bg = resolveTagColor(tagId, registry)
                  return (
                    <span key={tagId} className="tag-pill" style={{ '--tag-bg': bg } as CSSProperties}>
                      {label}
                    </span>
                  )
                })
              : <span className="task-meta-empty">No tags</span>}
          </div>
        </div>
      </div>
    </>
  )
}
