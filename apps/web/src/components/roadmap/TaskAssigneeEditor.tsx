'use client'

import { useState, type KeyboardEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { cleanAssigneeName, dedupeNames } from '@/lib/task-assignment'

interface TaskAssigneeEditorProps {
  assignees: string[]
  availableAssignees: string[]
  busy: boolean
  onChange: (assignees: string[]) => void
}

export function TaskAssigneeEditor({
  assignees,
  availableAssignees,
  busy,
  onChange,
}: TaskAssigneeEditorProps) {
  const [inputValue, setInputValue] = useState('')

  const suggestions = availableAssignees.filter(
    (name) => !assignees.some((a) => a.toLowerCase() === name.toLowerCase()),
  )

  const removeAssignee = (name: string) => {
    if (busy) return
    onChange(assignees.filter((a) => a.toLowerCase() !== name.toLowerCase()))
  }

  const addAssignee = (raw: string) => {
    if (busy) return
    const clean = cleanAssigneeName(raw)
    if (!clean) return
    onChange(dedupeNames([...assignees, clean]))
    setInputValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      addAssignee(inputValue)
    }
  }

  return (
    <div className={`assignee-editor-inline${busy ? ' is-busy' : ''}`}>
      <div className="assignee-chip-list">
        {assignees.length > 0 ? (
          assignees.map((name) => (
            <span key={name} className="assignee-pill assignee-chip">
              {name}
              <button
                type="button"
                className="assignee-chip-remove"
                onClick={() => removeAssignee(name)}
                disabled={busy}
                aria-label={`Remove assignee ${name}`}
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          ))
        ) : (
          <span className="muted">None</span>
        )}
      </div>
      <div className="assignee-input-row">
        <input
          className="assignee-chip-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add assignee…"
          disabled={busy}
        />
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => addAssignee(inputValue)}
          disabled={busy || !inputValue.trim()}
        >
          Add
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="assignee-suggestions">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              className="assignee-suggestion-item"
              onClick={() => addAssignee(name)}
              disabled={busy}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
