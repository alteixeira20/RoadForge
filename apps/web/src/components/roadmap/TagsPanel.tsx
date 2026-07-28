'use client'

import { useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'
import { useRoadmap } from '@/context/RoadmapContext'
import { useCoordinatedKeyboardReorder, useKeyboardReorderCoordinator } from '@/hooks/useKeyboardReorderCoordinator'
import {
  buildTagId,
  normalizeTagColor,
  normalizeTagLabel,
  normalizedTagLabelKey,
  TAG_REGISTRY_MAX,
  uniqueTagId,
} from '@/lib/tag-registry'
import type { TagDefinition } from '@/types/roadmap'
import { SortableTagRow } from './SortableTagRow'
import { TagChip } from './TagChip'
import { TagEditorFields } from './TagEditorFields'

const DEFAULT_COLOR = '#d97706'

interface TagFormState {
  label: string
  color: string
}

interface TagsPanelProps {
  readOnly?: boolean
}

export function TagsPanel({ readOnly = false }: TagsPanelProps) {
  const { tagRegistry, setTagRegistry, setSaved, phases } = useRoadmap()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [form, setForm] = useState<TagFormState>({
    label: '',
    color: DEFAULT_COLOR,
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [activeTagId, setActiveTagId] = useState<string | null>(null)

  const tagUsage = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const phase of phases) {
      for (const task of phase.tasks) {
        for (const tag of task.tags ?? []) {
          counts[tag] = (counts[tag] ?? 0) + 1
        }
      }
    }
    return counts
  }, [phases])

  const resetForm = () => {
    setForm({ label: '', color: DEFAULT_COLOR })
    setEditingId(null)
    setAddingNew(false)
    setFormError(null)
  }

  const handleStartAdd = () => {
    resetForm()
    setAddingNew(true)
  }

  const handleStartEdit = (tag: TagDefinition) => {
    setForm({
      label: tag.label,
      color: normalizeTagColor(tag.color) ?? DEFAULT_COLOR,
    })
    setEditingId(tag.id)
    setAddingNew(false)
    setFormError(null)
  }

  const hasDuplicateLabel = (label: string, excludingId?: string): boolean => {
    const labelKey = normalizedTagLabelKey(label)
    return tagRegistry.some(
      (tag) =>
        tag.id !== excludingId &&
        normalizedTagLabelKey(tag.label) === labelKey,
    )
  }

  const handleSaveNew = () => {
    const label = normalizeTagLabel(form.label)
    if (!label) return
    if (tagRegistry.length >= TAG_REGISTRY_MAX) {
      setFormError(`A roadmap can have at most ${TAG_REGISTRY_MAX} tags.`)
      return
    }
    if (hasDuplicateLabel(label)) {
      setFormError('A tag with this label already exists.')
      return
    }
    const base = buildTagId(label)
    if (!base) {
      setFormError('Use at least one letter or number in the tag label.')
      return
    }
    const now = new Date().toISOString()
    const newTag: TagDefinition = {
      id: uniqueTagId(base, tagRegistry),
      label,
      color: normalizeTagColor(form.color),
      createdAt: now,
      updatedAt: now,
    }
    setTagRegistry([...tagRegistry, newTag])
    setSaved(false)
    resetForm()
  }

  const handleSaveEdit = () => {
    if (!editingId) return
    const label = normalizeTagLabel(form.label)
    if (!label) return
    if (hasDuplicateLabel(label, editingId)) {
      setFormError('A tag with this label already exists.')
      return
    }
    setTagRegistry(
      tagRegistry.map((tag) =>
        tag.id === editingId
          ? {
              ...tag,
              label,
              color: normalizeTagColor(form.color),
              updatedAt: new Date().toISOString(),
            }
          : tag,
      ),
    )
    setSaved(false)
    resetForm()
  }

  const pendingDeleteTag = pendingDeleteId
    ? tagRegistry.find((tag) => tag.id === pendingDeleteId) ?? null
    : null

  const confirmDelete = () => {
    if (!pendingDeleteId) return
    setTagRegistry(tagRegistry.filter((tag) => tag.id !== pendingDeleteId))
    setSaved(false)
    if (editingId === pendingDeleteId) resetForm()
    setPendingDeleteId(null)
  }

  const tagIds = tagRegistry.map((tag) => tag.id)
  const activeTag = activeTagId
    ? tagRegistry.find((tag) => tag.id === activeTagId) ?? null
    : null

  const coordinator = useKeyboardReorderCoordinator()
  const keyboardReorder = useCoordinatedKeyboardReorder('roadmap-tags', tagIds, {
    disabled: readOnly,
    itemLabel: (id) => `tag ${tagRegistry.find((tag) => tag.id === id)?.label ?? ''}`,
    onCommit: (orderedIds) => {
      const reordered = orderedIds
        .map((id) => tagRegistry.find((tag) => tag.id === id))
        .filter((tag): tag is TagDefinition => tag !== undefined)
      setTagRegistry(reordered)
      setSaved(false)
    },
  })

  // Preview-then-commit (RF-034): render in preview order while a keyboard
  // reorder session targets this list, without mutating `tagRegistry` itself.
  const displayTagIds = keyboardReorder.previewIds ?? tagIds
  const displayTagRegistry = keyboardReorder.previewIds
    ? displayTagIds
        .map((id) => tagRegistry.find((tag) => tag.id === id))
        .filter((tag): tag is TagDefinition => tag !== undefined)
    : tagRegistry

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTagId(event.active.id as string)
    // A pointer drag starting anywhere must pre-empt an in-progress
    // keyboard reorder session, even one targeting a different list.
    coordinator.cancelActive()
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTagId(null)
    if (!over || active.id === over.id) return
    const oldIndex = tagIds.indexOf(active.id as string)
    const newIndex = tagIds.indexOf(over.id as string)
    if (oldIndex < 0 || newIndex < 0) return
    setTagRegistry(arrayMove(tagRegistry, oldIndex, newIndex))
    setSaved(false)
  }

  const handleDragCancel = () => {
    setActiveTagId(null)
  }

  return (
    <section className="tags-view" aria-labelledby="tags-view-title">
      <div className="tags-view-head">
        <div>
          <h2 id="tags-view-title">Tags</h2>
          <p>Define reusable labels and see where they are used in this roadmap.</p>
        </div>
        {!readOnly && !addingNew && editingId === null && (
          <button type="button" className="btn sm" onClick={handleStartAdd}>
            <Icon name="plus" size={13} /> New tag
          </button>
        )}
      </div>

      {readOnly && (
        <p className="tags-view-readonly">Tag management is read-only in this view.</p>
      )}

      {addingNew && (
        <TagEditorFields
          form={form}
          previewLabel="New tag"
          labelAriaLabel="New tag label"
          colorAriaLabel="New tag color"
          submitLabel="Add"
          submitDisabled={!form.label.trim()}
          onChange={setForm}
          onSubmit={handleSaveNew}
          onCancel={resetForm}
        />
      )}

      {formError && (
        <p className="tag-registry-error" role="alert">
          {formError}
        </p>
      )}

      {tagRegistry.length === 0 ? (
        <div className="tags-view-empty">
          <strong>No tags yet</strong>
          <p>
            {readOnly
              ? 'This roadmap does not use any tags.'
              : 'Create a tag here or add one while editing a task.'}
          </p>
        </div>
      ) : (
        <DndContext
          id="roadmap-tags"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={displayTagIds} strategy={verticalListSortingStrategy}>
            <ul className="tag-registry-list">
              {displayTagRegistry.map((tag) => (
                <SortableTagRow
                  key={tag.id}
                  tag={tag}
                  registry={tagRegistry}
                  count={tagUsage[tag.id] ?? 0}
                  readOnly={readOnly}
                  isKeyboardActive={keyboardReorder.activeId === tag.id}
                  onKeyboardKeyDown={(event) => keyboardReorder.handleKeyDown(event, tag.id)}
                  onKeyboardBlur={keyboardReorder.cancel}
                  isEditing={editingId === tag.id}
                  form={form}
                  onFormChange={setForm}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={resetForm}
                  onStartEdit={() => handleStartEdit(tag)}
                  onRequestDelete={() => setPendingDeleteId(tag.id)}
                />
              ))}
            </ul>
          </SortableContext>
          <DragOverlay
            dropAnimation={{
              duration: 110,
              easing: 'cubic-bezier(0.2, 0, 0, 1)',
              sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
            }}
          >
            {activeTag ? (
              <div className="tag-registry-row sortable-dragging-overlay">
                <TagChip tagId={activeTag.id} registry={tagRegistry} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <ConfirmDialog
        open={pendingDeleteTag !== null}
        title="Delete tag?"
        message={`Delete the unused tag "${pendingDeleteTag?.label ?? ''}"?`}
        confirmLabel="Delete tag"
        tone="danger"
        onConfirm={confirmDelete}
        onClose={() => setPendingDeleteId(null)}
      />
    </section>
  )
}
