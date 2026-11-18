'use client'

import { useEffect, useRef, useState } from 'react'
import {
  cleanAssigneeName,
  dedupeNames,
  getTaskAssignees,
  getVisibleTaskTags,
} from '@/lib/task-assignment'
import { TagInput, splitAndNormalizeTags } from './TagInput'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { MarkdownToolbar } from './MarkdownToolbar'
import {
  createTaskEditDraft,
  isTaskEditDraftDirty,
  itemsMatch,
  type TaskEditDraft,
} from '@/lib/task-edit'
import { TASK_COMPLEXITY_LEVELS, getTaskComplexity, getTaskComplexityOption } from '@/lib/task-complexity'
import type { Task, TaskComplexity, TagDefinition } from '@/types/roadmap'

interface FieldConflict {
  serverValue: unknown
  displayValue: string
  fieldLabel: string
}

function FieldConflictAlert({
  conflict,
  onKeepDraft,
  onUseServer,
}: {
  conflict: FieldConflict
  onKeepDraft: () => void
  onUseServer: () => void
}) {
  return (
    <div className="task-field-conflict" role="alert" aria-live="assertive">
      <div className="task-field-conflict-title">
        <strong>Server conflict:</strong> Another collaborator updated this {conflict.fieldLabel.toLowerCase()} to:
      </div>
      <div className="task-field-conflict-val">
        &ldquo;{conflict.displayValue}&rdquo;
      </div>
      <div className="task-field-conflict-actions">
        <button
          type="button"
          className="btn sm ghost"
          onClick={onKeepDraft}
        >
          Keep my draft
        </button>
        <button
          type="button"
          className="btn sm primary"
          onClick={onUseServer}
        >
          Use server version
        </button>
      </div>
    </div>
  )
}

interface TaskEditFormProps {
  task: Task
  isNested: boolean
  directSubtaskCount: number
  availableAssignees: string[]
  registry?: TagDefinition[]
  onSave: (updates: Partial<Task>) => void | Promise<void>
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
  canCommit?: boolean
}

export function TaskEditForm({
  task,
  isNested,
  directSubtaskCount,
  availableAssignees,
  registry = [],
  onSave,
  onCancel,
  onDirtyChange,
  canCommit = true,
}: TaskEditFormProps) {
  const [draft, setDraft] = useState<TaskEditDraft>(() => createTaskEditDraft(task))
  const [conflicts, setConflicts] = useState<Record<string, FieldConflict>>({})
  const [assigneeDraft, setAssigneeDraft] = useState('')
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const initialTaskRef = useRef<Task>(task)
  const prevTaskRef = useRef<Task>(task)

  const isDirty = isTaskEditDraftDirty(draft, initialTaskRef.current) || Object.keys(conflicts).length > 0
  const hasConflicts = Object.keys(conflicts).length > 0
  const complexityOption = getTaskComplexityOption(draft.complexity)
  const invalidNestedComplexity = isNested && draft.complexity === 'very_high'
  const missingBreakdown = !isNested
    && draft.complexity === 'very_high'
    && directSubtaskCount < 2
  const complexityInvalid = invalidNestedComplexity || missingBreakdown

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  useEffect(() => {
    if (task === prevTaskRef.current) return
    prevTaskRef.current = task
    const initial = initialTaskRef.current

    setConflicts((currentConflicts) => {
      const nextConflicts = { ...currentConflicts }
      let conflictsChanged = false

      // Title
      const serverTitle = task.title
      const initialTitle = initial.title
      if (serverTitle !== initialTitle) {
        const isLocallyModified = draft.title.trim() !== initialTitle.trim()
        if (isLocallyModified) {
          if (serverTitle !== draft.title) {
            nextConflicts.title = {
              serverValue: serverTitle,
              displayValue: serverTitle,
              fieldLabel: 'Title',
            }
            conflictsChanged = true
          } else if (nextConflicts.title) {
            delete nextConflicts.title
            conflictsChanged = true
            initialTaskRef.current = { ...initialTaskRef.current, title: serverTitle }
          }
        } else {
          setDraft((d) => ({ ...d, title: serverTitle }))
          initialTaskRef.current = { ...initialTaskRef.current, title: serverTitle }
          if (nextConflicts.title) {
            delete nextConflicts.title
            conflictsChanged = true
          }
        }
      }

      // Description
      const serverDesc = task.desc ?? ''
      const initialDesc = initial.desc ?? ''
      if (serverDesc !== initialDesc) {
        const isLocallyModified = draft.desc !== initialDesc
        if (isLocallyModified) {
          if (serverDesc !== draft.desc) {
            nextConflicts.desc = {
              serverValue: serverDesc,
              displayValue: serverDesc || '(empty)',
              fieldLabel: 'Description',
            }
            conflictsChanged = true
          } else if (nextConflicts.desc) {
            delete nextConflicts.desc
            conflictsChanged = true
            initialTaskRef.current = { ...initialTaskRef.current, desc: task.desc }
          }
        } else {
          setDraft((d) => ({ ...d, desc: serverDesc }))
          initialTaskRef.current = { ...initialTaskRef.current, desc: task.desc }
          if (nextConflicts.desc) {
            delete nextConflicts.desc
            conflictsChanged = true
          }
        }
      }

      // Complexity
      const serverComplexity = getTaskComplexity(task)
      const initialComplexity = getTaskComplexity(initial)
      if (serverComplexity !== initialComplexity) {
        const isLocallyModified = draft.complexity !== initialComplexity
        if (isLocallyModified) {
          if (serverComplexity !== draft.complexity) {
            nextConflicts.complexity = {
              serverValue: serverComplexity,
              displayValue: getTaskComplexityOption(serverComplexity).label,
              fieldLabel: 'Complexity',
            }
            conflictsChanged = true
          } else if (nextConflicts.complexity) {
            delete nextConflicts.complexity
            conflictsChanged = true
            initialTaskRef.current = { ...initialTaskRef.current, complexity: serverComplexity }
          }
        } else {
          setDraft((d) => ({ ...d, complexity: serverComplexity }))
          initialTaskRef.current = { ...initialTaskRef.current, complexity: serverComplexity }
          if (nextConflicts.complexity) {
            delete nextConflicts.complexity
            conflictsChanged = true
          }
        }
      }

      // Estimate
      const serverEst = task.est ?? ''
      const initialEst = initial.est ?? ''
      if (serverEst !== initialEst) {
        const isLocallyModified = draft.est.trim() !== initialEst.trim()
        if (isLocallyModified) {
          if (serverEst !== draft.est) {
            nextConflicts.est = {
              serverValue: serverEst,
              displayValue: serverEst || '(none)',
              fieldLabel: 'Time estimate',
            }
            conflictsChanged = true
          } else if (nextConflicts.est) {
            delete nextConflicts.est
            conflictsChanged = true
            initialTaskRef.current = { ...initialTaskRef.current, est: task.est }
          }
        } else {
          setDraft((d) => ({ ...d, est: serverEst }))
          initialTaskRef.current = { ...initialTaskRef.current, est: task.est }
          if (nextConflicts.est) {
            delete nextConflicts.est
            conflictsChanged = true
          }
        }
      }

      // Assignees
      const serverAssignees = getTaskAssignees(task)
      const initialAssignees = getTaskAssignees(initial)
      if (!itemsMatch(serverAssignees, initialAssignees)) {
        const isLocallyModified = !itemsMatch(dedupeNames(draft.assignees), initialAssignees)
        if (isLocallyModified) {
          if (!itemsMatch(dedupeNames(draft.assignees), serverAssignees)) {
            nextConflicts.assignees = {
              serverValue: serverAssignees,
              displayValue: serverAssignees.length > 0 ? serverAssignees.join(', ') : '(none)',
              fieldLabel: 'Assignees',
            }
            conflictsChanged = true
          } else if (nextConflicts.assignees) {
            delete nextConflicts.assignees
            conflictsChanged = true
            initialTaskRef.current = { ...initialTaskRef.current, assignees: task.assignees }
          }
        } else {
          setDraft((d) => ({ ...d, assignees: serverAssignees }))
          initialTaskRef.current = { ...initialTaskRef.current, assignees: task.assignees }
          if (nextConflicts.assignees) {
            delete nextConflicts.assignees
            conflictsChanged = true
          }
        }
      }

      // Tags
      const serverTags = getVisibleTaskTags(task)
      const initialTags = getVisibleTaskTags(initial)
      if (!itemsMatch(serverTags, initialTags)) {
        const isLocallyModified = !itemsMatch(splitAndNormalizeTags(draft.tags), initialTags)
        if (isLocallyModified) {
          if (!itemsMatch(splitAndNormalizeTags(draft.tags), serverTags)) {
            nextConflicts.tags = {
              serverValue: serverTags,
              displayValue: serverTags.length > 0 ? serverTags.join(', ') : '(none)',
              fieldLabel: 'Tags',
            }
            conflictsChanged = true
          } else if (nextConflicts.tags) {
            delete nextConflicts.tags
            conflictsChanged = true
            initialTaskRef.current = { ...initialTaskRef.current, tags: task.tags }
          }
        } else {
          setDraft((d) => ({ ...d, tags: serverTags }))
          initialTaskRef.current = { ...initialTaskRef.current, tags: task.tags }
          if (nextConflicts.tags) {
            delete nextConflicts.tags
            conflictsChanged = true
          }
        }
      }

      return conflictsChanged ? nextConflicts : currentConflicts
    })
  }, [task, draft])

  const resolveConflictKeepDraft = (field: string) => {
    setConflicts((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
    if (field === 'title') {
      initialTaskRef.current = { ...initialTaskRef.current, title: task.title }
    } else if (field === 'desc') {
      initialTaskRef.current = { ...initialTaskRef.current, desc: task.desc }
    } else if (field === 'complexity') {
      initialTaskRef.current = { ...initialTaskRef.current, complexity: task.complexity }
    } else if (field === 'est') {
      initialTaskRef.current = { ...initialTaskRef.current, est: task.est }
    } else if (field === 'assignees') {
      initialTaskRef.current = { ...initialTaskRef.current, assignees: task.assignees }
    } else if (field === 'tags') {
      initialTaskRef.current = { ...initialTaskRef.current, tags: task.tags }
    }
  }

  const resolveConflictUseServer = (field: string) => {
    const conflict = conflicts[field]
    if (!conflict) return
    setConflicts((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
    if (field === 'title') {
      setDraft((d) => ({ ...d, title: conflict.serverValue as string }))
      initialTaskRef.current = { ...initialTaskRef.current, title: task.title }
    } else if (field === 'desc') {
      setDraft((d) => ({ ...d, desc: conflict.serverValue as string }))
      initialTaskRef.current = { ...initialTaskRef.current, desc: task.desc }
    } else if (field === 'complexity') {
      setDraft((d) => ({ ...d, complexity: conflict.serverValue as TaskComplexity }))
      initialTaskRef.current = { ...initialTaskRef.current, complexity: task.complexity }
    } else if (field === 'est') {
      setDraft((d) => ({ ...d, est: conflict.serverValue as string }))
      initialTaskRef.current = { ...initialTaskRef.current, est: task.est }
    } else if (field === 'assignees') {
      setDraft((d) => ({ ...d, assignees: conflict.serverValue as string[] }))
      initialTaskRef.current = { ...initialTaskRef.current, assignees: task.assignees }
    } else if (field === 'tags') {
      setDraft((d) => ({ ...d, tags: conflict.serverValue as string[] }))
      initialTaskRef.current = { ...initialTaskRef.current, tags: task.tags }
    }
  }

  const handleSave = () => {
    if (!canCommit || !draft.title.trim() || complexityInvalid || hasConflicts) return
    const assignees = dedupeNames(draft.assignees)
    onSave({
      title: draft.title.trim(),
      est: draft.est,
      complexity: draft.complexity,
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
        <label htmlFor={`edit-title-${task.id}`}>Title</label>
        <input
          id={`edit-title-${task.id}`}
          autoFocus
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onKeyDown={handleTitleKeyDown}
          placeholder="Task title…"
        />
        {conflicts.title && (
          <FieldConflictAlert
            conflict={conflicts.title}
            onKeepDraft={() => resolveConflictKeepDraft('title')}
            onUseServer={() => resolveConflictUseServer('title')}
          />
        )}
      </div>
      <div className="field">
        <label htmlFor={`edit-complexity-${task.id}`}>Complexity</label>
        <select
          id={`edit-complexity-${task.id}`}
          value={draft.complexity}
          onChange={(e) => setDraft({ ...draft, complexity: e.target.value as TaskComplexity })}
        >
          {TASK_COMPLEXITY_LEVELS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.value === 'very_high' && (isNested || directSubtaskCount < 2)}
            >
              {option.label}
            </option>
          ))}
        </select>
        <small>{complexityOption.description}</small>
        {!isNested && directSubtaskCount < 2 && draft.complexity !== 'very_high' && (
          <small>Very high unlocks after this task has at least two direct subtasks.</small>
        )}
        {missingBreakdown && (
          <small role="alert">Very high complexity requires at least two direct subtasks.</small>
        )}
        {invalidNestedComplexity && (
          <small role="alert">Nested tasks cannot be Very high because RoadForge supports one subtask level.</small>
        )}
        {conflicts.complexity && (
          <FieldConflictAlert
            conflict={conflicts.complexity}
            onKeepDraft={() => resolveConflictKeepDraft('complexity')}
            onUseServer={() => resolveConflictUseServer('complexity')}
          />
        )}
      </div>
      {!isNested && (
        <div className="field">
          <label htmlFor={`edit-est-${task.id}`}>Time estimate (optional)</label>
          <input
            id={`edit-est-${task.id}`}
            value={draft.est}
            onChange={(e) => setDraft({ ...draft, est: e.target.value })}
            onKeyDown={handleTitleKeyDown}
            placeholder="e.g. 2d, 5h…"
          />
          <small>Heuristic only - complexity is the primary planning signal.</small>
          {conflicts.est && (
            <FieldConflictAlert
              conflict={conflicts.est}
              onKeepDraft={() => resolveConflictKeepDraft('est')}
              onUseServer={() => resolveConflictUseServer('est')}
            />
          )}
        </div>
      )}
      <div className="field full">
        <label htmlFor={`edit-desc-${task.id}`}>Description</label>
        <MarkdownToolbar
          textareaRef={descriptionRef}
          value={draft.desc}
          onChange={(desc) => setDraft({ ...draft, desc })}
        />
        <textarea
          id={`edit-desc-${task.id}`}
          ref={descriptionRef}
          value={draft.desc}
          onChange={(e) => setDraft({ ...draft, desc: e.target.value })}
          onKeyDown={handleTextareaKeyDown}
          placeholder="Task details… Markdown supported"
          rows={6}
        />
        {conflicts.desc && (
          <FieldConflictAlert
            conflict={conflicts.desc}
            onKeepDraft={() => resolveConflictKeepDraft('desc')}
            onUseServer={() => resolveConflictUseServer('desc')}
          />
        )}
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
                    aria-pressed={selected}
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
              aria-label="Add new assignee"
            />
            <button type="button" className="btn sm ghost" onClick={handleAddAssignee}>
              Add assignee
            </button>
          </div>
          {draft.assignees.length === 0 && (
            <span className="empty-assignees">None</span>
          )}
        </div>
        {conflicts.assignees && (
          <FieldConflictAlert
            conflict={conflicts.assignees}
            onKeepDraft={() => resolveConflictKeepDraft('assignees')}
            onUseServer={() => resolveConflictUseServer('assignees')}
          />
        )}
      </div>
      <div className="field full">
        <label>Tags</label>
        <TagInput
          tags={draft.tags}
          onChange={(tags) => setDraft({ ...draft, tags })}
          registry={registry}
        />
        {conflicts.tags && (
          <FieldConflictAlert
            conflict={conflicts.tags}
            onKeepDraft={() => resolveConflictKeepDraft('tags')}
            onUseServer={() => resolveConflictUseServer('tags')}
          />
        )}
      </div>
      <div className="edit-actions">
        {hasConflicts && (
          <span className="edit-form-conflict-warning" role="alert">
            Resolve conflicting fields before saving.
          </span>
        )}
        <button className="btn sm ghost" onClick={requestCancel}>Cancel</button>
        <button
          className="btn sm primary"
          onClick={handleSave}
          disabled={!draft.title.trim() || !canCommit || complexityInvalid || hasConflicts}
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
