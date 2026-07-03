'use client'

import { TagInput } from './TagInput'
import type { TagDefinition } from '@/types/roadmap'

interface TaskTagEditorProps {
  tags: string[]
  registry: TagDefinition[]
  busy: boolean
  onChange: (tags: string[]) => void
}

export function TaskTagEditor({ tags, registry, busy, onChange }: TaskTagEditorProps) {
  return (
    <div className={`task-tag-editor${busy ? ' is-busy' : ''}`}>
      <TagInput tags={tags} onChange={onChange} registry={registry} variant="pill" disabled={busy} />
    </div>
  )
}
