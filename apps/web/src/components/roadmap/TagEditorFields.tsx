'use client'

import type { KeyboardEvent } from 'react'
import { normalizeTagColor } from '@/lib/tag-registry'
import type { TagDefinition } from '@/types/roadmap'
import { TagChip } from './TagChip'

const PREVIEW_TAG_ID = '__tag-editor-preview__'

interface TagFormState {
  label: string
  color: string
}

interface TagEditorFieldsProps {
  form: TagFormState
  previewLabel: string
  labelAriaLabel: string
  colorAriaLabel: string
  submitLabel: string
  submitDisabled?: boolean
  onChange: (form: TagFormState) => void
  onSubmit: () => void
  onCancel: () => void
}

export function TagEditorFields({
  form,
  previewLabel,
  labelAriaLabel,
  colorAriaLabel,
  submitLabel,
  submitDisabled = false,
  onChange,
  onSubmit,
  onCancel,
}: TagEditorFieldsProps) {
  const previewRegistry: TagDefinition[] = [
    {
      id: PREVIEW_TAG_ID,
      label: form.label.trim() || previewLabel,
      color: normalizeTagColor(form.color),
    },
  ]

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') onSubmit()
    if (event.key === 'Escape') onCancel()
  }

  return (
    <div className="tag-registry-form">
      <TagChip
        tagId={PREVIEW_TAG_ID}
        registry={previewRegistry}
        className="tag-registry-preview"
      />
      <input
        className="tag-registry-input"
        value={form.label}
        onChange={(event) => onChange({ ...form, label: event.target.value })}
        onKeyDown={handleKeyDown}
        autoFocus
        aria-label={labelAriaLabel}
        placeholder="Tag label"
      />
      <input
        type="color"
        className="tag-registry-color"
        value={form.color}
        onChange={(event) => onChange({ ...form, color: event.target.value })}
        aria-label={colorAriaLabel}
      />
      <button
        type="button"
        className="btn sm primary"
        onClick={onSubmit}
        disabled={submitDisabled}
      >
        {submitLabel}
      </button>
      <button type="button" className="btn sm ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
