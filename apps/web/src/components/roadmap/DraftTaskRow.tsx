'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'

interface DraftTaskRowProps {
  onConfirm: (title: string) => void
  onDiscard: () => void
  onDirtyChange?: (dirty: boolean) => void
}

export function DraftTaskRow({ onConfirm, onDiscard, onDirtyChange }: DraftTaskRowProps) {
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleConfirm = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onDiscard()
    }
  }

  return (
    <div className="draft-task-row">
      <div className="draft-task-check" aria-hidden="true" />
      <input
        ref={inputRef}
        className="draft-task-input"
        value={title}
        onChange={(e) => {
        setTitle(e.target.value)
        onDirtyChange?.(e.target.value.trim().length > 0)
      }}
        onKeyDown={handleKeyDown}
        placeholder="New task title…"
      />
      <div className="draft-task-actions">
        <button
          type="button"
          className="btn sm primary"
          onClick={handleConfirm}
          disabled={!title.trim()}
        >
          <Icon name="check" size={13} /> Create
        </button>
        <button type="button" className="btn sm ghost" onClick={onDiscard}>
          Cancel
        </button>
      </div>
    </div>
  )
}
