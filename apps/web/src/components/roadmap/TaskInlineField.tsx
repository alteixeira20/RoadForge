'use client'

import { useRef, type KeyboardEvent } from 'react'
import type { InlineTaskField } from '@/hooks/taskMutationHelpers'

interface TaskInlineFieldProps {
  field: Extract<InlineTaskField, 'title'>
  value: string
  draft: string
  active: boolean
  editable: boolean
  busy: boolean
  canCommit: boolean
  error?: string
  errorId?: string
  onBegin: () => void
  onDraftChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  onInteraction: () => void
}

export function TaskInlineField({
  field,
  value,
  draft,
  active,
  editable,
  busy,
  canCommit,
  error,
  errorId,
  onBegin,
  onDraftChange,
  onCommit,
  onCancel,
  onInteraction,
}: TaskInlineFieldProps) {
  const composingRef = useRef(false)
  const skipBlurCommitRef = useRef(false)
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || composingRef.current) return
    if (event.key === 'Enter') {
      event.preventDefault()
      skipBlurCommitRef.current = true
      onInteraction()
      if (canCommit) onCommit()
      queueMicrotask(() => { skipBlurCommitRef.current = false })
    } else if (event.key === 'Escape') {
      event.preventDefault()
      skipBlurCommitRef.current = true
      onCancel()
    }
  }

  if (active) {
    return (
      <span className={`inline-task-field is-${field}`}>
        <input
          className="inline-task-input"
          value={draft}
          aria-label="Task title"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          autoFocus
          onChange={(event) => onDraftChange(event.target.value)}
          onBlur={() => {
            if (canCommit && !composingRef.current && !skipBlurCommitRef.current) {
              onCommit()
            }
          }}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onInput={onInteraction}
          onKeyDown={handleKeyDown}
          onPointerDown={onInteraction}
        />
        {error && (
          <span id={errorId} className="inline-field-error" role="alert">
            {error}
          </span>
        )}
      </span>
    )
  }

  if (!editable) {
    return <span className="title">{value}</span>
  }

  return (
    <button
      type="button"
      className="title inline-title-trigger"
      onClick={onBegin}
      disabled={busy}
      aria-label={`Edit task title: ${value}`}
    >
      {value}
    </button>
  )
}
