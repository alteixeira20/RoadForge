'use client'

import { useEffect, useRef, useState } from 'react'
import {
  cleanAssigneeName,
  dedupeNames,
} from '@/lib/task-assignment'
import { TagInput, splitAndNormalizeTags } from './TagInput'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { MarkdownToolbar } from './MarkdownToolbar'
import {
  createTaskEditDraft,
  isTaskEditDraftDirty,
  type TaskEditDraft,
} from '@/lib/task-edit'
import type { Task, TagDefinition } from '@/types/roadmap'

interface TaskEditFormProps {
  task: Task
  isNested: boolean
  availableAssignees: string[]
  registry?: TagDefinition[]
  onSave: (updates: Partial<Task>) => void
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
  canCommit?: boolean
}

export function TaskEditForm({
  task,
  isNested,
  availableAssignees,
  registry = [],
  onSave,
  onCancel,
  onDirtyChange,
  canCommit = true,
}: TaskEditFormProps) {
  const [draft, setDraft] = useState<TaskEditDraft>(() => createTaskEditDraft(task))
  const [assigneeDraft, setAssigneeDraft] = useState('')
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  const isDirty = isTaskEditDraftDirty(draft, task)

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const handleSave = () => {
    if (!canCommit || !draft.title.trim()) return
    const assignees = dedupeNames(draft.assignees)
    onSave({
      title: draft.title.trim(),
      est: draft.est,
      desc: draft.desc,
      assignees,
      tags: splitAndNormalizeTags(draft.tags),
    })
  }

  const toggleAssignee = (name: string) => {
    const clean = cleanAssigneeName(name)
    if (!clean) return
    const current = draft.assignees
    const exists = current.some((item) => item.toLowerCase() === clean.toLowerCase())
    setDraft({
      ...draft,
      assignees: exists
        ? current.filter((item) => item.toLowerCase() !== clean.toLowerCase())
        : dedupeNames([...current, clean]),
    })
  }

  const handleAddAssignee = () => {
    const clean = cleanAssigneeName(assigneeDraft)
    if (!clean) return
    setDraft({ ...draft, assignees: dedupeNames([...draft.assignees, clean]) })
    setAssigneeDraft('')
  }

  const requestCancel = () => {
    if (isDirty) {
      setConfirmCancelOpen(true)
      return
    }
    onCancel()
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      requestCancel()
    }
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') {
      e.preventDefault()
      requestCancel()
    }
    // Enter in textarea keeps default newline behavior
  }

  const handleAssigneeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddAssignee()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      requestCancel()
    }
  }

  return (
    <div className="edit-form">
      <div className="field">
        <label>Title</label>
        <input
          autoFocus
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onKeyDown={handleTitleKeyDown}
          placeholder="Task title…"
        />
      </div>
      {!isNested && (
        <div className="field">
          <label>Estimate</label>
          <input
            value={draft.est}
            onChange={(e) => setDraft({ ...draft, est: e.target.value })}
            onKeyDown={handleTitleKeyDown}
            placeholder="e.g. 2d, 5h…"
          />
        </div>
      )}
      <div className="field full">
        <label>Description</label>
        <MarkdownToolbar
          textareaRef={descriptionRef}
          value={draft.desc}
          onChange={(desc) => setDraft({ ...draft, desc })}
        />
        <textarea
          ref={descriptionRef}
          value={draft.desc}
          onChange={(e) => setDraft({ ...draft, desc: e.target.value })}
          onKeyDown={handleTextareaKeyDown}
          placeholder="Task details… Markdown supported"
          rows={6}
        />
      </div>
      <div className="field full">
        <label>Assigned</label>
        <div className="assignee-editor">
          {availableAssignees.length > 0 && (
            <div className="assignee-options">
              {availableAssignees.map((name) => {
                const selected = draft.assignees.some(
                  (item) => item.toLowerCase() === name.toLowerCase(),
                )
                return (
                  <button
                    key={name}
                    type="button"
                    className={`assignee-option ${selected ? 'selected' : ''}`}
                    onClick={() => toggleAssignee(name)}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          )}
          <div className="add-assignee-row">
            <input
              value={assigneeDraft}
              onChange={(e) => setAssigneeDraft(e.target.value)}
              onKeyDown={handleAssigneeInputKeyDown}
              placeholder="Add assignee"
            />
            <button type="button" className="btn sm ghost" onClick={handleAddAssignee}>
              Add assignee
            </button>
          </div>
          {draft.assignees.length === 0 && (
            <span className="empty-assignees">None</span>
          )}
        </div>
      </div>
      <div className="field full">
        <label>Tags</label>
        <TagInput
          tags={draft.tags}
          onChange={(tags) => setDraft({ ...draft, tags })}
          registry={registry}
        />
      </div>
      <div className="edit-actions">
        <button className="btn sm ghost" onClick={requestCancel}>Cancel</button>
        <button
          className="btn sm primary"
          onClick={handleSave}
          disabled={!draft.title.trim() || !canCommit}
        >
          Save
        </button>
      </div>
      <ConfirmDialog
        open={confirmCancelOpen}
        title="Discard unsaved changes?"
        message="Your edits will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={onCancel}
        onClose={() => setConfirmCancelOpen(false)}
      />
    </div>
  )
}
