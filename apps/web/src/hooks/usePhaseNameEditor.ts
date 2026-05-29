'use client'

import { useEffect, useRef, useState } from 'react'
import type React from 'react'

interface UsePhaseNameEditorParams {
  name: string
  readOnly: boolean
  isLockedByOther: boolean
  renameKey?: number
  onBeforeEdit: () => Promise<boolean>
  onSave: (name: string) => void
  onEditingChange?: (editing: boolean) => void
}

export function usePhaseNameEditor({
  name,
  readOnly,
  isLockedByOther,
  renameKey,
  onBeforeEdit,
  onSave,
  onEditingChange,
}: UsePhaseNameEditorParams) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

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

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handleDoubleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (readOnly || isLockedByOther) return
    const ok = await onBeforeEdit()
    if (!ok) return
    setDraft(name)
    setEditing(true)
    onEditingChange?.(true)
  }

  const commitSave = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    onSave(trimmed)
    exitEditing()
  }

  const requestCancel = () => {
    if (isDirty) {
      setConfirmDiscard(true)
      return
    }
    exitEditing()
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
    exitEditing,
    handleDoubleClick,
    commitSave,
    requestCancel,
    handleKeyDown,
  }
}
