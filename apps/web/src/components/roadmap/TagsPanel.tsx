'use client'

import { useMemo, useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'
import { useRoadmap } from '@/context/RoadmapContext'
import {
  buildTagId,
  normalizeTagColor,
  normalizeTagLabel,
  normalizedTagLabelKey,
  TAG_REGISTRY_MAX,
  uniqueTagId,
} from '@/lib/tag-registry'
import type { TagDefinition } from '@/types/roadmap'
import { TagChip } from './TagChip'

const DEFAULT_COLOR = '#d97706'

interface TagFormState {
  label: string
  color: string
}

interface TagsPanelProps {
  readOnly?: boolean
}

function usageLabel(count: number): string {
  if (count === 0) return 'Not used'
  if (count === 1) return '1 task'
  return `${count} tasks`
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

  const moveTag = (id: string, direction: -1 | 1) => {
    const index = tagRegistry.findIndex((tag) => tag.id === id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= tagRegistry.length) return
    const reordered = [...tagRegistry]
    const [tag] = reordered.splice(index, 1)
    reordered.splice(nextIndex, 0, tag)
    setTagRegistry(reordered)
    setSaved(false)
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
        <div className="tag-registry-form tag-registry-form--new">
          <input
            className="tag-registry-input"
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSaveNew()
              if (event.key === 'Escape') resetForm()
            }}
            autoFocus
            aria-label="New tag label"
            placeholder="Tag label"
          />
          <input
            type="color"
            className="tag-registry-color"
            value={form.color}
            onChange={(event) => setForm({ ...form, color: event.target.value })}
            aria-label="New tag color"
          />
          <button
            type="button"
            className="btn sm primary"
            onClick={handleSaveNew}
            disabled={!form.label.trim()}
          >
            Add
          </button>
          <button type="button" className="btn sm ghost" onClick={resetForm}>
            Cancel
          </button>
        </div>
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
        <ul className="tag-registry-list">
          {tagRegistry.map((tag) => {
            const count = tagUsage[tag.id] ?? 0
            const isUsed = count > 0
            return (
              <li key={tag.id} className="tag-registry-row">
                {editingId === tag.id ? (
                  <div className="tag-registry-form">
                    <input
                      className="tag-registry-input"
                      value={form.label}
                      onChange={(event) =>
                        setForm({ ...form, label: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleSaveEdit()
                        if (event.key === 'Escape') resetForm()
                      }}
                      autoFocus
                      aria-label={`Tag label for ${tag.label}`}
                    />
                    <input
                      type="color"
                      className="tag-registry-color"
                      value={form.color}
                      onChange={(event) =>
                        setForm({ ...form, color: event.target.value })
                      }
                      aria-label={`Tag color for ${tag.label}`}
                    />
                    <button
                      type="button"
                      className="btn sm primary"
                      onClick={handleSaveEdit}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={resetForm}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <TagChip tagId={tag.id} registry={tagRegistry} />
                    <span className="tag-registry-id">{tag.id}</span>
                    <span className="tag-registry-usage">{usageLabel(count)}</span>
                    {!readOnly && (
                      <div className="tag-registry-actions">
                        <button
                          type="button"
                          className="iconbtn"
                          onClick={() => moveTag(tag.id, -1)}
                          disabled={tagRegistry[0]?.id === tag.id}
                          aria-label={`Move tag ${tag.label} earlier`}
                        >
                          <Icon name="chevron-up" size={13} />
                        </button>
                        <button
                          type="button"
                          className="iconbtn"
                          onClick={() => moveTag(tag.id, 1)}
                          disabled={
                            tagRegistry[tagRegistry.length - 1]?.id === tag.id
                          }
                          aria-label={`Move tag ${tag.label} later`}
                        >
                          <Icon name="chevron-down" size={13} />
                        </button>
                        <button
                          type="button"
                          className="iconbtn"
                          onClick={() => handleStartEdit(tag)}
                          aria-label={`Edit tag ${tag.label}`}
                        >
                          <Icon name="pencil" size={13} />
                        </button>
                        <button
                          type="button"
                          className="iconbtn"
                          onClick={() => {
                            if (!isUsed) setPendingDeleteId(tag.id)
                          }}
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
          })}
        </ul>
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
