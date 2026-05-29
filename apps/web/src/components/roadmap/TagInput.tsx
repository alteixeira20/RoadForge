'use client'

import { useState } from 'react'
import { removeAssignmentTags } from '@/lib/task-assignment'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
}

function normalizeSingle(raw: string): string {
  return raw.trim().toLowerCase()
}

export function splitAndNormalizeTags(raw: string[]): string[] {
  return removeAssignmentTags(
    raw.flatMap((t) => t.split(',')).map(normalizeSingle).filter(Boolean),
  )
}

function dedupeTagList(tags: string[]): string[] {
  const seen = new Set<string>()
  return tags.filter((t) => {
    if (seen.has(t)) return false
    seen.add(t)
    return true
  })
}

export function TagInput({ tags, onChange }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  const commitInput = (raw: string) => {
    const next = splitAndNormalizeTags([...tags, raw])
    onChange(dedupeTagList(next))
    setInputValue('')
  }

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (inputValue.trim()) commitInput(inputValue)
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val.endsWith(',')) {
      commitInput(val.slice(0, -1))
    } else {
      setInputValue(val)
    }
  }

  return (
    <div className="tag-input-field">
      {tags.length > 0 && (
        <div className="tag-chip-list">
          {tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
              <button
                type="button"
                className="tag-chip-remove"
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="tag-chip-input"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? 'Add tags…' : 'Add another…'}
      />
    </div>
  )
}
