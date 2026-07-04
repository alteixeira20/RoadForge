'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { MarkdownDescription } from './MarkdownDescription'
import { MarkdownToolbar } from './MarkdownToolbar'

interface TaskDescriptionEditorProps {
  value: string
  draft: string
  active: boolean
  editable: boolean
  busy: boolean
  canCommit: boolean
  onBegin: () => void
  onDraftChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  onInteraction: () => void
}

type EditorTab = 'markdown' | 'preview'

export function TaskDescriptionEditor({
  value,
  draft,
  active,
  editable,
  busy,
  canCommit,
  onBegin,
  onDraftChange,
  onCommit,
  onCancel,
  onInteraction,
}: TaskDescriptionEditorProps) {
  const [tab, setTab] = useState<EditorTab>('markdown')
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const composingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isDirty = draft !== value

  // Default to source mode each time editing (re)starts, since the user just clicked to edit.
  useEffect(() => {
    if (active) setTab('markdown')
  }, [active])

  const requestCancel = () => {
    if (isDirty) {
      setConfirmDiscardOpen(true)
      return
    }
    onCancel()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || composingRef.current) return
    if (event.key === 'Escape') {
      event.preventDefault()
      requestCancel()
      return
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      onInteraction()
      if (canCommit) onCommit()
    }
  }

  if (!active) {
    if (!value) {
      if (!editable) return null
      return (
        <button type="button" className="desc-add-trigger" onClick={onBegin}>
          <Icon name="plus" size={13} /> Add description
        </button>
      )
    }
    if (!editable) {
      return <MarkdownDescription value={value} />
    }
    return (
      <div className="desc-preview-wrap">
        <MarkdownDescription value={value} />
        <button
          type="button"
          className="desc-edit-trigger"
          onClick={onBegin}
          disabled={busy}
          aria-label="Edit description"
          title="Edit description"
        >
          <Icon name="pencil" size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className="desc-editor" onKeyDown={handleKeyDown}>
      <div className="desc-editor-tabs" role="tablist" aria-label="Description view">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'markdown'}
          className={tab === 'markdown' ? 'active' : ''}
          onClick={() => setTab('markdown')}
        >
          Markdown
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'preview'}
          className={tab === 'preview' ? 'active' : ''}
          onClick={() => setTab('preview')}
        >
          Preview
        </button>
      </div>

      {tab === 'preview' ? (
        <div className="desc-editor-preview">
          {draft
            ? <MarkdownDescription value={draft} />
            : <span className="muted">Nothing to preview</span>}
        </div>
      ) : (
        <>
          <MarkdownToolbar textareaRef={textareaRef} value={draft} onChange={onDraftChange} />
          <textarea
            ref={textareaRef}
            className="desc-editor-textarea"
            value={draft}
            autoFocus
            onChange={(event) => onDraftChange(event.target.value)}
            onInput={onInteraction}
            onPointerDown={onInteraction}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={() => { composingRef.current = false }}
            placeholder="Task details… Markdown supported"
            rows={6}
          />
        </>
      )}

      <div className="desc-editor-actions">
        <button type="button" className="btn sm ghost" onClick={requestCancel}>Cancel</button>
        <button
          type="button"
          className="btn sm primary"
          onClick={() => { onInteraction(); onCommit() }}
          disabled={!canCommit || busy}
        >
          Save
        </button>
      </div>

      <ConfirmDialog
        open={confirmDiscardOpen}
        title="Discard unsaved changes?"
        message="Your description edits will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => {
          setConfirmDiscardOpen(false)
          onCancel()
        }}
        onClose={() => setConfirmDiscardOpen(false)}
      />
    </div>
  )
}
