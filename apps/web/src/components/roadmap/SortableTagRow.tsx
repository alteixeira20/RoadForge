'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Icon } from '@/components/ui/Icon'
import { TagChip } from './TagChip'
import { TagEditorFields } from './TagEditorFields'
import type { TagDefinition } from '@/types/roadmap'

interface TagFormState {
  label: string
  color: string
}

interface SortableTagRowProps {
  tag: TagDefinition
  registry: TagDefinition[]
  count: number
  readOnly: boolean
  isKeyboardActive: boolean
  onKeyboardKeyDown: (event: { code: string; preventDefault: () => void }) => void
  isEditing: boolean
  form: TagFormState
  onFormChange: (form: TagFormState) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onStartEdit: () => void
  onRequestDelete: () => void
}

function usageLabel(count: number): string {
  if (count === 0) return 'Not used'
  if (count === 1) return '1 task'
  return `${count} tasks`
}

export function SortableTagRow({
  tag,
  registry,
  count,
  readOnly,
  isKeyboardActive,
  onKeyboardKeyDown,
  isEditing,
  form,
  onFormChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onRequestDelete,
}: SortableTagRowProps) {
  const canDrag = !readOnly && !isEditing
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tag.id,
    disabled: !canDrag,
    transition: { duration: 130, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  })

  const style = { transform: CSS.Transform.toString(transform), transition }
  const isUsed = count > 0

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`tag-registry-row${isDragging ? ' sortable-dragging' : ''}`}
    >
      {!readOnly && (
        <span
          className={`tag-drag-handle${canDrag ? '' : ' disabled'}`}
          aria-hidden={!canDrag}
          aria-label={canDrag ? `Reorder tag ${tag.label}` : undefined}
          {...(canDrag ? {
            ...attributes,
            ...listeners,
            'aria-pressed': isDragging || isKeyboardActive,
            onKeyDown: onKeyboardKeyDown,
          } : {})}
        >
          <Icon name="grip" size={13} />
        </span>
      )}
      {isEditing ? (
        <TagEditorFields
          form={form}
          previewLabel={tag.label}
          labelAriaLabel={`Tag label for ${tag.label}`}
          colorAriaLabel={`Change color for ${tag.label}`}
          submitLabel="Save"
          onChange={onFormChange}
          onSubmit={onSaveEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <>
          <TagChip tagId={tag.id} registry={registry} />
          <span className="tag-registry-id">{tag.id}</span>
          <span className="tag-registry-usage">{usageLabel(count)}</span>
          {!readOnly && (
            <div className="tag-registry-actions">
              <button
                type="button"
                className="iconbtn"
                onClick={onStartEdit}
                aria-label={`Edit tag ${tag.label}`}
              >
                <Icon name="pencil" size={13} />
              </button>
              <button
                type="button"
                className="iconbtn"
                onClick={onRequestDelete}
                disabled={isUsed}
                aria-disabled={isUsed}
                aria-label={
                  isUsed
                    ? `Cannot delete tag ${tag.label}: ${usageLabel(count)}`
                    : `Delete tag ${tag.label}`
                }
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          )}
        </>
      )}
    </li>
  )
}
