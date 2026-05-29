'use client'

import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface InlineEditableFieldProps {
  value: string
  onSave: (value: string) => void
  readOnly: boolean
  onBeforeEdit?: () => Promise<boolean>
  multiline?: boolean
  placeholder?: string
  className?: string
  allowBlank?: boolean
  emptyText?: string
}

export function InlineEditableField({
  value,
  onSave,
  readOnly,
  onBeforeEdit,
  multiline = false,
  placeholder,
  className = '',
  allowBlank = false,
  emptyText = '—',
}: InlineEditableFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isDirty = draft !== value

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (!editing) return
    if (multiline) {
      textareaRef.current?.focus()
    } else {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing, multiline])

  const startEditing = async () => {
    if (readOnly) return
    if (onBeforeEdit) {
      const ok = await onBeforeEdit()
      if (!ok) return
    }
    setDraft(value)
    setEditing(true)
  }

  const commitSave = () => {
    const trimmed = draft.trim()
    if (!allowBlank && !trimmed) return
    onSave(trimmed)
    setEditing(false)
  }

  const requestCancel = () => {
    if (isDirty) {
      setConfirmDiscard(true)
      return
    }
    setEditing(false)
  }

  const doDiscard = () => {
    setConfirmDiscard(false)
    setEditing(false)
  }

  const handleSingleLineKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') { e.preventDefault(); commitSave() }
    else if (e.key === 'Escape') { e.preventDefault(); requestCancel() }
  }

  const handleMultilineKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); commitSave() }
    else if (e.key === 'Escape') { e.preventDefault(); requestCancel() }
  }

  const refocusInput = () => {
    if (multiline) textareaRef.current?.focus()
    else inputRef.current?.focus()
  }

  if (editing) {
    return (
      <>
        {multiline ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleMultilineKeyDown}
            placeholder={placeholder}
            className={`inline-edit-input multiline ${className}`}
            rows={3}
          />
        ) : (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleSingleLineKeyDown}
            placeholder={placeholder}
            className={`inline-edit-input ${className}`}
          />
        )}
        <ConfirmDialog
          open={confirmDiscard}
          title="Discard unsaved changes?"
          message="Your edits will be lost."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          tone="danger"
          onConfirm={doDiscard}
          onClose={() => { setConfirmDiscard(false); refocusInput() }}
        />
      </>
    )
  }

  return (
    <div
      className={`inline-edit-display${readOnly ? '' : ' editable'}${className ? ' ' + className : ''}`}
      onDoubleClick={(e) => { e.stopPropagation(); void startEditing() }}
      title={readOnly ? undefined : 'Double-click to edit'}
    >
      {value || <span className="inline-edit-empty">{emptyText}</span>}
    </div>
  )
}
