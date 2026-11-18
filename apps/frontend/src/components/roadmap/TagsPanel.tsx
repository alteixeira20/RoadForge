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
import {
  createServerTag,
  updateServerTag,
  deleteServerTag,
  reorderServerTags,
} from '@/services/roadmap-crud.service'
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
  onToast?: (message: string) => void
}

export function TagsPanel({ readOnly = false, onToast }: TagsPanelProps) {
  const {
    tagRegistry,
    setTagRegistry,
    setSaved,
    phases,
    serverRoadmapId,
    sessionToken,
    setUpdatedAt,
  } = useRoadmap()
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

  const handleSaveNew = async () => {
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
    const nextRegistry = [...tagRegistry, newTag]
    setTagRegistry(nextRegistry)
    resetForm()

    if (serverRoadmapId && sessionToken && !readOnly) {
      try {
        const res = await createServerTag(serverRoadmapId, {
          id: newTag.id,
          label: newTag.label,
          color: newTag.color,
        }, sessionToken)
        if (res.tagRegistry) setTagRegistry(res.tagRegistry)
        if (res.updatedAt) setUpdatedAt(res.updatedAt)
      } catch (err) {
        console.error('Failed to create tag on server:', err)
        onToast?.('Could not save tag to server')
      }
    } else {
      setSaved(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const label = normalizeTagLabel(form.label)
    if (!label) return
    if (hasDuplicateLabel(label, editingId)) {
      setFormError('A tag with this label already exists.')
      return
    }
    const prevRegistry = tagRegistry
    const nextRegistry = tagRegistry.map((tag) =>
      tag.id === editingId
        ? {
            ...tag,
            label,
            color: normalizeTagColor(form.color),
            updatedAt: new Date().toISOString(),
          }
        : tag,
    )
    setTagRegistry(nextRegistry)
    const tagIdToUpdate = editingId
    const updatedColor = normalizeTagColor(form.color)
    resetForm()

    if (serverRoadmapId && sessionToken && !readOnly) {
      try {
        const res = await updateServerTag(serverRoadmapId, tagIdToUpdate, {
          label,
          color: updatedColor,
        }, sessionToken)
        if (res.tagRegistry) setTagRegistry(res.tagRegistry)
        if (res.updatedAt) setUpdatedAt(res.updatedAt)
      } catch (err) {
        console.error('Failed to update tag on server:', err)
        setTagRegistry(prevRegistry)
        onToast?.('Could not update tag on server')
      }
    } else {
      setSaved(false)
    }
  }

  const pendingDeleteTag = pendingDeleteId
    ? tagRegistry.find((tag) => tag.id === pendingDeleteId) ?? null
    : null

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    const deleteId = pendingDeleteId
    const prevRegistry = tagRegistry
    const nextRegistry = tagRegistry.filter((tag) => tag.id !== deleteId)
    setTagRegistry(nextRegistry)
    if (editingId === deleteId) resetForm()
    setPendingDeleteId(null)

    if (serverRoadmapId && sessionToken && !readOnly) {
      try {
        const res = await deleteServerTag(serverRoadmapId, deleteId, sessionToken)
        if (res.tagRegistry) setTagRegistry(res.tagRegistry)
        if (res.updatedAt) setUpdatedAt(res.updatedAt)
      } catch (err) {
        console.error('Failed to delete tag on server:', err)
        setTagRegistry(prevRegistry)
        onToast?.('Could not delete tag on server')
      }
    } else {
      setSaved(false)
    }
  }

  const tagIds = tagRegistry.map((tag) => tag.id)
  const activeTag = activeTagId
    ? tagRegistry.find((tag) => tag.id === activeTagId) ?? null
    : null

  const coordinator = useKeyboardReorderCoordinator()
  const keyboardReorder = useCoordinatedKeyboardReorder('roadmap-tags', tagIds, {
    disabled: readOnly,
    itemLabel: (id) => `tag ${tagRegistry.find((tag) => tag.id === id)?.label ?? ''}`,
    onCommit: async (orderedIds) => {
      const reordered = orderedIds
        .map((id) => tagRegistry.find((tag) => tag.id === id))
        .filter((tag): tag is TagDefinition => tag !== undefined)
      setTagRegistry(reordered)
      if (serverRoadmapId && sessionToken && !readOnly) {
        try {
          const res = await reorderServerTags(serverRoadmapId, orderedIds, sessionToken)
          if (res.tagRegistry) setTagRegistry(res.tagRegistry)
          if (res.updatedAt) setUpdatedAt(res.updatedAt)
        } catch (err) {
          console.error('Failed to reorder tags on server:', err)
          onToast?.('Could not save tag order to server')
        }
      } else {
        setSaved(false)
      }
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTagId(null)
    if (!over || active.id === over.id) return
    const oldIndex = tagIds.indexOf(active.id as string)
    const newIndex = tagIds.indexOf(over.id as string)
    if (oldIndex < 0 || newIndex < 0) return
    const nextRegistry = arrayMove(tagRegistry, oldIndex, newIndex)
    setTagRegistry(nextRegistry)
    const nextIds = nextRegistry.map((t) => t.id)
    if (serverRoadmapId && sessionToken && !readOnly) {
      try {
        const res = await reorderServerTags(serverRoadmapId, nextIds, sessionToken)
        if (res.tagRegistry) setTagRegistry(res.tagRegistry)
        if (res.updatedAt) setUpdatedAt(res.updatedAt)
      } catch (err) {
        console.error('Failed to reorder tags on server:', err)
        onToast?.('Could not save tag order to server')
      }
    } else {
      setSaved(false)
    }
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
