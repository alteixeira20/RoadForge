'use client'

import { type CSSProperties, type ReactNode } from 'react'
import type { Task, TagDefinition } from '@/types/roadmap'
import { resolveTagColor, resolveTagDisplay } from '@/lib/tag-registry'
import { MarkdownDescription } from './MarkdownDescription'

interface TaskDetailMetaProps {
  task: Task
  isNested: boolean
  assignedNames: string[]
  visibleTags: string[]
  registry?: TagDefinition[]
  estimateControl?: ReactNode
  tagsControl?: ReactNode
  assigneesControl?: ReactNode
  showDescription?: boolean
}

export function TaskDetailMeta({
  task,
  isNested,
  assignedNames,
  visibleTags,
  registry = [],
  estimateControl,
  tagsControl,
  assigneesControl,
  showDescription = true,
}: TaskDetailMetaProps) {
  return (
    <>
      {showDescription && task.desc && <MarkdownDescription value={task.desc} />}

      <div className="grid">
        {!isNested && (
          <>
            <div className="label">Estimate</div>
            <div className="value">{estimateControl ?? task.est ?? '—'}</div>
          </>
        )}
        <div className="label">Assigned</div>
        <div className="value assignees">
          {assigneesControl ?? (
            assignedNames.length > 0 ? (
              assignedNames.map((name) => (
                <span key={name} className="assignee-pill">{name}</span>
              ))
            ) : (
              <span className="muted">None</span>
            )
          )}
        </div>
        {(visibleTags.length > 0 || tagsControl) && (
          <>
            <div className="label">Tags</div>
            <div className="value tags">
              {tagsControl ?? visibleTags.map((tagId) => {
                const { label } = resolveTagDisplay(tagId, registry)
                const bg = resolveTagColor(tagId, registry)
                return (
                  <span key={tagId} className="tag-pill" style={{ '--tag-bg': bg } as CSSProperties}>
                    {label}
                  </span>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
