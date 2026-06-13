'use client'

import { type CSSProperties } from 'react'
import type { Task, TagDefinition } from '@/types/roadmap'
import { resolveTagColor, resolveTagDisplay } from '@/lib/tag-registry'

interface TaskDetailMetaProps {
  task: Task
  isNested: boolean
  assignedNames: string[]
  visibleTags: string[]
  registry?: TagDefinition[]
}

export function TaskDetailMeta({ task, isNested, assignedNames, visibleTags, registry = [] }: TaskDetailMetaProps) {
  return (
    <>
      {task.desc && <div className="desc">{task.desc}</div>}

      <div className="grid">
        {!isNested && (
          <>
            <div className="label">Estimate</div>
            <div className="value">{task.est ?? '—'}</div>
          </>
        )}
        <div className="label">Assigned</div>
        <div className="value assignees">
          {assignedNames.length > 0 ? (
            assignedNames.map((name) => (
              <span key={name} className="assignee-pill">{name}</span>
            ))
          ) : (
            <span className="muted">None</span>
          )}
        </div>
        {visibleTags.length > 0 && (
          <>
            <div className="label">Tags</div>
            <div className="value tags">
              {visibleTags.map((tagId) => {
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
