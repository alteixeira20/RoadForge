'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { ColorPickerPopover } from '@/components/ui/ColorPickerPopover'
import { ColorSwatchButton } from '@/components/ui/ColorSwatchButton'
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
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorTriggerRef = useRef<HTMLButtonElement | null>(null)
  const colorDialogId = useId()

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
      <ColorSwatchButton
        ref={colorTriggerRef}
        color={form.color}
        label={colorAriaLabel}
        expanded={showColorPicker}
        controls={showColorPicker ? colorDialogId : undefined}
        onClick={() => setShowColorPicker((open) => !open)}
      />
      <ColorPickerPopover
        open={showColorPicker}
        anchorRef={colorTriggerRef}
        id={colorDialogId}
        ariaLabel={colorAriaLabel}
        value={form.color}
        onSelect={(color) => {
          onChange({ ...form, color })
          setShowColorPicker(false)
        }}
        onClose={() => setShowColorPicker(false)}
        customLabel="Custom tag hex color"
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
