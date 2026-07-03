'use client'

import { useState, useMemo } from 'react'
import { Icon } from '@/components/ui/Icon'
import type { Task } from '@/types/roadmap'

interface SubtaskFormProps {
  onAdd: (title: string) => void
  onCancel: () => void
  canCommit?: boolean
}

export function SubtaskForm({ onAdd, onCancel, canCommit = true }: SubtaskFormProps) {
  const [title, setTitle] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (canCommit && title.trim()) {
      onAdd(title.trim())
      setTitle('')
    }
  }

  return (
    <form className="task-action-form" onSubmit={handleSubmit}>
      <input
        autoFocus
        type="text"
        placeholder="Subtask title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="form-input"
      />
      <div className="form-actions">
        <button type="submit" className="btn sm primary" disabled={!title.trim() || !canCommit}>
          Add
        </button>
        <button type="button" className="btn sm ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

interface DependencyPickerProps {
  currentTask: Task
  allTasks: Task[]
  onLink: (depId: string) => void
  onCancel: () => void
  hasCycle: (taskId: string, depId: string) => boolean
  canCommit?: boolean
}

export function DependencyPicker({
  currentTask,
  allTasks,
  onLink,
  onCancel,
  hasCycle,
  canCommit = true,
}: DependencyPickerProps) {
  const [search, setSearch] = useState('')

  const availableTasks = useMemo(() => {
    const existingDeps = new Set(currentTask.deps || [])
    return allTasks.filter((t) => {
      if (t.id === currentTask.id) return false
      if (existingDeps.has(t.id)) return false
      if (hasCycle(currentTask.id, t.id)) return false
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.id.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [allTasks, currentTask.id, currentTask.deps, hasCycle, search])

  return (
    <div className="task-action-form">
      <div className="search-wrap">
        <Icon name="search" size={14} />
        <input
          autoFocus
          type="text"
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input-clean"
        />
      </div>
      <div className="task-list-mini">
        {availableTasks.length === 0 ? (
          <div className="empty-state">No available tasks to link</div>
        ) : (
          availableTasks.map((t) => (
            <button
              key={t.id}
              className="task-option"
              onClick={() => {
                if (canCommit) onLink(t.id)
              }}
              disabled={!canCommit}
            >
              <span className="tid">{t.id}</span>
              <span className="tt">{t.title}</span>
            </button>
          ))
        )}
      </div>
      <div className="form-actions">
        <button type="button" className="btn sm ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
