'use client'

import { useState, useRef, type CSSProperties } from 'react'
import { removeAssignmentTags } from '@/lib/task-assignment'
import { buildTagId, resolveTagColor, resolveTagDisplay } from '@/lib/tag-registry'
import type { TagDefinition } from '@/types/roadmap'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  registry?: TagDefinition[]
  /** 'pill' renders colored registry pills (task detail inline editing); 'chip' (default) matches the plain edit-form style. */
  variant?: 'chip' | 'pill'
  disabled?: boolean
}

function normalizeSingle(raw: string): string {
  return buildTagId(raw)
}

export function splitAndNormalizeTags(raw: string[]): string[] {
  const split = raw.flatMap((t) => t.split(',')).map((t) => t.trim()).filter(Boolean)
  return removeAssignmentTags(split).map(normalizeSingle).filter(Boolean)
}

function dedupeTagList(tags: string[]): string[] {
  const seen = new Set<string>()
  return tags.filter((t) => {
    if (seen.has(t)) return false
    seen.add(t)
    return true
  })
}

export function TagInput({
  tags,
  onChange,
  registry = [],
  variant = 'chip',
  disabled = false,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const isPill = variant === 'pill'

  const suggestions = inputValue.trim()
    ? registry.filter(
        (t) =>
          !tags.includes(t.id) &&
          (t.label.toLowerCase().includes(inputValue.toLowerCase()) ||
            t.id.toLowerCase().includes(inputValue.toLowerCase())),
      )
    : []

  const commitInput = (raw: string) => {
    if (disabled) return
    const next = splitAndNormalizeTags([...tags, raw])
    onChange(dedupeTagList(next))
    setInputValue('')
    setShowSuggestions(false)
  }

  const commitSuggestion = (tag: TagDefinition) => {
    if (disabled || tags.includes(tag.id)) return
    onChange(dedupeTagList([...tags, tag.id]))
    setInputValue('')
    setShowSuggestions(false)
  }

  const removeTag = (tag: string) => {
    if (disabled) return
    onChange(tags.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (inputValue.trim()) commitInput(inputValue)
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val.endsWith(',')) {
      commitInput(val.slice(0, -1))
    } else {
      setInputValue(val)
      setShowSuggestions(true)
    }
  }

  const resolveLabel = (tagId: string): string => {
    const entry = registry.find((t) => t.id === tagId)
    return entry ? entry.label : tagId
  }

  return (
    <div className={`tag-input-field${isPill ? ' tag-input-field-pill' : ''}`} ref={wrapRef}>
      {tags.length > 0 && (
        <div className="tag-chip-list">
          {tags.map((tag) => {
            if (!isPill) {
              return (
                <span key={tag} className="tag-chip">
                  {resolveLabel(tag)}
                  <button
                    type="button"
                    className="tag-chip-remove"
                    onClick={() => removeTag(tag)}
                    disabled={disabled}
                    aria-label={`Remove tag ${resolveLabel(tag)}`}
                  >
                    ×
                  </button>
                </span>
              )
            }
            const { label } = resolveTagDisplay(tag, registry)
            const bg = resolveTagColor(tag, registry)
            return (
              <span
                key={tag}
                className="tag-pill tag-pill-editable"
                style={{ '--tag-bg': bg } as CSSProperties}
              >
                {label}
                <button
                  type="button"
                  className="tag-pill-remove"
                  onClick={() => removeTag(tag)}
                  disabled={disabled}
                  aria-label={`Remove tag ${label}`}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
      <div className="tag-input-wrap">
        <input
          className="tag-chip-input"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={tags.length === 0 ? 'Add tags…' : 'Add another…'}
          disabled={disabled}
        />
        {!disabled && showSuggestions && suggestions.length > 0 && (
          <ul className="tag-suggestions">
            {suggestions.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  className="tag-suggestion-item"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    commitSuggestion(tag)
                  }}
                >
                  {tag.color && (
                    <span
                      className="tag-suggestion-dot"
                      style={{ background: tag.color }}
                    />
                  )}
                  {tag.label}
                  {tag.label !== tag.id && (
                    <span className="tag-suggestion-id">{tag.id}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
