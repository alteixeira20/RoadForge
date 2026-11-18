'use client'

import { useEffect, useRef, useState } from 'react'
import type React from 'react'

interface UsePhaseNameEditorParams {
  name: string
  renameKey?: number
  onSave: (name: string) => void
  onEditingChange?: (editing: boolean) => void
}

export function usePhaseNameEditor({
  name,
  renameKey,
  onSave,
  onEditingChange,
}: UsePhaseNameEditorParams) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const suppressBlurRef = useRef(false)

  const isDirty = draft.trim() !== name

  const prevRenameKeyRef = useRef(renameKey ?? 0)
  // Triggered programmatically (e.g. menu rename). Lock has already been acquired by caller.
  useEffect(() => {
    if (!renameKey || renameKey === prevRenameKeyRef.current) return
    prevRenameKeyRef.current = renameKey
    setDraft(name)
    setEditing(true)
    onEditingChange?.(true)
  }, [renameKey, name, onEditingChange])

  const exitEditing = () => {
    setEditing(false)
    onEditingChange?.(false)
  }

  const focusInputAtStart = () => {
    suppressBlurRef.current = false
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.setSelectionRange(0, 0)
    input.scrollLeft = 0
  }

  useEffect(() => {
    if (!editing) return
    focusInputAtStart()
    const timer = window.setTimeout(focusInputAtStart, 0)
    return () => window.clearTimeout(timer)
  }, [editing])

  const commitSave = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      window.setTimeout(focusInputAtStart, 0)
      return
    }
    onSave(trimmed)
    exitEditing()
  }

  const requestCancel = () => {
    if (isDirty) {
      suppressBlurRef.current = true
      setConfirmDiscard(true)
      return
    }
    exitEditing()
  }

  const handleBlur = () => {
    if (confirmDiscard) return
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false
      return
    }
    commitSave()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') { e.preventDefault(); commitSave() }
    else if (e.key === 'Escape') { e.preventDefault(); requestCancel() }
  }

  return {
    editing,
    draft,
    setDraft,
    confirmDiscard,
    setConfirmDiscard,
    inputRef,
    focusInputAtStart,
    exitEditing,
    commitSave,
    requestCancel,
    handleKeyDown,
    handleBlur,
  }
}
