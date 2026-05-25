'use client'

import { useState } from 'react'
import {
  cleanAssigneeName,
  dedupeNames,
  getTaskAssignees,
  getVisibleTaskTags,
  removeAssignmentTags,
} from '@/lib/task-assignment'
import type { Task } from '@/types/roadmap'

interface TaskEditFormProps {
  task: Task
  isNested: boolean
  availableAssignees: string[]
  onSave: (updates: Partial<Task>) => void
  onCancel: () => void
}

export function TaskEditForm({
  task,
  isNested,
  availableAssignees,
  onSave,
  onCancel,
}: TaskEditFormProps) {
  const [editDraft, setEditDraft] = useState<Partial<Task>>({
    title: task.title,
    est: task.est,
    desc: task.desc,
    assignees: getTaskAssignees(task),
    tags: getVisibleTaskTags(task),
  })
  const [assigneeDraft, setAssigneeDraft] = useState('')

  const handleSave = () => {
    const assignees = dedupeNames(editDraft.assignees ?? [])
    onSave({
      ...editDraft,
      title: editDraft.title?.trim(),
      assignees,
      tags: removeAssignmentTags(
        (editDraft.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      ),
    })
  }

  const toggleAssignee = (name: string) => {
    const clean = cleanAssigneeName(name)
    if (!clean) return
    const current = editDraft.assignees ?? []
    const exists = current.some((item) => item.toLowerCase() === clean.toLowerCase())
    setEditDraft({
      ...editDraft,
      assignees: exists
        ? current.filter((item) => item.toLowerCase() !== clean.toLowerCase())
        : dedupeNames([...current, clean]),
    })
  }

  const handleAddAssignee = () => {
    const clean = cleanAssigneeName(assigneeDraft)
    if (!clean) return
    setEditDraft({ ...editDraft, assignees: dedupeNames([...(editDraft.assignees ?? []), clean]) })
    setAssigneeDraft('')
  }

  return (
    <div className="edit-form">
      <div className="field">
        <label>Title</label>
        <input
          autoFocus
          value={editDraft.title || ''}
          onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
          placeholder="Task title..."
        />
      </div>
      {!isNested && (
        <div className="field">
          <label>Estimate</label>
          <input
            value={editDraft.est || ''}
            onChange={(e) => setEditDraft({ ...editDraft, est: e.target.value })}
            placeholder="e.g. 2d, 5h..."
          />
        </div>
      )}
      <div className="field full">
        <label>Description</label>
        <textarea
          value={editDraft.desc || ''}
          onChange={(e) => setEditDraft({ ...editDraft, desc: e.target.value })}
          placeholder="Task details..."
          rows={3}
        />
      </div>
      <div className="field full">
        <label>Assigned</label>
        <div className="assignee-editor">
          {availableAssignees.length > 0 && (
            <div className="assignee-options">
              {availableAssignees.map((name) => {
                const selected = (editDraft.assignees ?? []).some(
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddAssignee()
                }
              }}
              placeholder="Add assignee"
            />
            <button type="button" className="btn sm ghost" onClick={handleAddAssignee}>
              Add assignee
            </button>
          </div>
          {(editDraft.assignees ?? []).length === 0 && (
            <span className="empty-assignees">None</span>
          )}
        </div>
      </div>
      <div className="field full">
        <label>Tags (comma separated)</label>
        <input
          value={(editDraft.tags || []).join(', ')}
          onChange={(e) => setEditDraft({ ...editDraft, tags: e.target.value.split(',') })}
          placeholder="infra, design..."
        />
      </div>
      <div className="edit-actions">
        <button className="btn sm ghost" onClick={onCancel}>Discard</button>
        <button className="btn sm primary" onClick={handleSave}>Save</button>
      </div>
    </div>
  )
}
