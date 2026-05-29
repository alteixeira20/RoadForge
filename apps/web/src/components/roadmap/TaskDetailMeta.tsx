'use client'

import { type CSSProperties } from 'react'
import { InlineEditableField } from './InlineEditableField'
import type { Task } from '@/types/roadmap'

interface TaskDetailMetaProps {
  task: Task
  isNested: boolean
  assignedNames: string[]
  visibleTags: string[]
  readOnly?: boolean
  onBeforeEdit?: () => Promise<boolean>
  onSaveDesc?: (desc: string) => void
  onSaveEst?: (est: string) => void
  onInlineEditingChange?: (field: string, editing: boolean) => void
}

const TAG_COLORS: Record<string, string> = {
  infra: '#7c3aed', // violet
  design: '#db2777', // pink
  security: '#dc2626', // red
  backend: '#2563eb', // blue
  frontend: '#0891b2', // cyan
  polish: '#ca8a04', // yellow
  subtask: '#4b5563', // gray
}

function getTagColor(tag: string): string {
  const normalized = tag.toLowerCase().trim()
  if (TAG_COLORS[normalized]) return TAG_COLORS[normalized]

  // Deterministic color from a small palette
  const palette = [
    '#059669', // emerald
    '#d97706', // amber
    '#4f46e5', // indigo
    '#9333ea', // purple
    '#c026d3', // fuchsia
    '#e11d48', // rose
  ]
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash)
  }
  return palette[Math.abs(hash) % palette.length]
}

export function TaskDetailMeta({
  task,
  isNested,
  assignedNames,
  visibleTags,
  readOnly = true,
  onBeforeEdit,
  onSaveDesc,
  onSaveEst,
  onInlineEditingChange,
}: TaskDetailMetaProps) {
  return (
    <>
      {onSaveDesc ? (
        <InlineEditableField
          value={task.desc ?? ''}
          onSave={onSaveDesc}
          readOnly={readOnly}
          onBeforeEdit={onBeforeEdit}
          multiline
          placeholder="Add a description…"
          className="desc"
          allowBlank
          emptyText="No description. Double-click to add."
          onEditingChange={(editing) => onInlineEditingChange?.('desc', editing)}
        />
      ) : (
        task.desc && <div className="desc">{task.desc}</div>
      )}

      <div className="grid">
        {!isNested && (
          <>
            <div className="label">Estimate</div>
            {onSaveEst ? (
              <InlineEditableField
                value={task.est ?? ''}
                onSave={onSaveEst}
                readOnly={readOnly}
                onBeforeEdit={onBeforeEdit}
                placeholder="e.g. 2d, 5h…"
                className="value"
                allowBlank
                emptyText="—"
                onEditingChange={(editing) => onInlineEditingChange?.('est', editing)}
              />
            ) : (
              <div className="value">{task.est ?? '—'}</div>
            )}
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
              {visibleTags.map((g) => (
                <span key={g} className="tag-pill" style={{ '--tag-bg': getTagColor(g) } as CSSProperties}>
                  {g}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
