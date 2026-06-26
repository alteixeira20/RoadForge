'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
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

interface TagRegistryModalProps {
  open: boolean
  onClose: () => void
  readOnly?: boolean
}

interface TagFormState {
  label: string
  color: string
}

const DEFAULT_COLOR = '#6366f1'

export function TagRegistryModal({ open, onClose, readOnly = false }: TagRegistryModalProps) {
  const { tagRegistry, setTagRegistry, setSaved, phases } = useRoadmap()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [form, setForm] = useState<TagFormState>({ label: '', color: DEFAULT_COLOR })
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
    setForm({ label: tag.label, color: tag.color || DEFAULT_COLOR })
    setEditingId(tag.id)
    setAddingNew(false)
    setFormError(null)
  }

  const hasDuplicateLabel = (label: string, excludingId?: string): boolean => {
    const labelKey = normalizedTagLabelKey(label)
    return tagRegistry.some(
      (tag) => tag.id !== excludingId && normalizedTagLabelKey(tag.label) === labelKey,
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
    const id = uniqueTagId(base, tagRegistry)
    const newTag: TagDefinition = {
      id,
      label,
      color: normalizeTagColor(form.color),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
    const updated = tagRegistry.map((t) =>
      t.id === editingId
        ? {
            ...t,
            label,
            color: normalizeTagColor(form.color),
            updatedAt: new Date().toISOString(),
          }
        : t,
    )
    setTagRegistry(updated)
    setSaved(false)
    resetForm()
  }

  const pendingDeleteTag = pendingDeleteId
    ? tagRegistry.find((item) => item.id === pendingDeleteId) ?? null
    : null

  const handleDelete = (id: string) => {
    const tag = tagRegistry.find((item) => item.id === id)
    if (!tag) return
    setPendingDeleteId(id)
  }

  const confirmDelete = () => {
    if (!pendingDeleteId) return
    setTagRegistry(tagRegistry.filter((t) => t.id !== pendingDeleteId))
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
    <Modal open={open} onClose={onClose} title="Tag Registry">
      <div className="tag-registry-modal">
        {tagRegistry.length === 0 && !addingNew && (
          <p className="tag-registry-empty">No tags defined. Tags are created automatically when added to tasks, or you can define them here with custom colors.</p>
        )}

        {tagRegistry.length > 0 && (
          <ul className="tag-registry-list">
            {tagRegistry.map((tag) => {
              const usageCount = tagUsage[tag.id] ?? 0
              const isUsed = usageCount > 0
              return (
                <li key={tag.id} className="tag-registry-row">
                  {editingId === tag.id ? (
                    <div className="tag-registry-form">
                      <input
                        className="tag-registry-input"
                        value={form.label}
                        onChange={(e) => setForm({ ...form, label: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit()
                          if (e.key === 'Escape') resetForm()
                        }}
                        autoFocus
                        placeholder="Tag label"
                      />
                      <input
                        type="color"
                        className="tag-registry-color"
                        value={form.color}
                        onChange={(e) => setForm({ ...form, color: e.target.value })}
                        title="Pick color"
                      />
                      <button type="button" className="btn sm primary" onClick={handleSaveEdit}>Save</button>
                      <button type="button" className="btn sm ghost" onClick={resetForm}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <span
                        className="tag-pill"
                        style={{ '--tag-bg': tag.color } as React.CSSProperties}
                      >
                        {tag.label}
                      </span>
                      <span className="tag-registry-id">{tag.id}</span>
                      {isUsed && (
                        <span className="tag-registry-usage" title={`Used by ${usageCount} task${usageCount !== 1 ? 's' : ''}`}>
                          {usageCount}
                        </span>
                      )}
                      {!readOnly && (
                        <div className="tag-registry-actions">
                          <button
                            type="button"
                            className="iconbtn"
                            onClick={() => moveTag(tag.id, -1)}
                            disabled={tagRegistry[0]?.id === tag.id}
                            title="Move tag up"
                          >
                            <Icon name="chevron-up" size={13} />
                          </button>
                          <button
                            type="button"
                            className="iconbtn"
                            onClick={() => moveTag(tag.id, 1)}
                            disabled={tagRegistry[tagRegistry.length - 1]?.id === tag.id}
                            title="Move tag down"
                          >
                            <Icon name="chevron-down" size={13} />
                          </button>
                          <button
                            type="button"
                            className="iconbtn"
                            onClick={() => handleStartEdit(tag)}
                            title="Edit tag"
                          >
                            <Icon name="pencil" size={13} />
                          </button>
                          <button
                            type="button"
                            className="iconbtn"
                            onClick={() => !isUsed && handleDelete(tag.id)}
                            disabled={isUsed}
                            title={isUsed ? `Cannot delete: used by ${usageCount} task${usageCount !== 1 ? 's' : ''}` : 'Delete tag'}
                            aria-disabled={isUsed}
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

        {addingNew && (
          <div className="tag-registry-form tag-registry-form--new">
            <input
              className="tag-registry-input"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveNew()
                if (e.key === 'Escape') resetForm()
              }}
              autoFocus
              placeholder="Tag label"
            />
            <input
              type="color"
              className="tag-registry-color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              title="Pick color"
            />
            <button type="button" className="btn sm primary" onClick={handleSaveNew} disabled={!form.label.trim()}>Add</button>
            <button type="button" className="btn sm ghost" onClick={resetForm}>Cancel</button>
          </div>
        )}

        {formError && <p className="tag-registry-error" role="alert">{formError}</p>}

        {!readOnly && !addingNew && editingId === null && (
          <button type="button" className="btn sm ghost tag-registry-add-btn" onClick={handleStartAdd}>
            <Icon name="plus" size={13} /> Add tag
          </button>
        )}
      </div>

      <ConfirmDialog
        open={pendingDeleteTag !== null}
        title="Delete tag?"
        message={`Delete the unused tag "${pendingDeleteTag?.label ?? ''}"?`}
        confirmLabel="Delete tag"
        tone="danger"
        onConfirm={confirmDelete}
        onClose={() => setPendingDeleteId(null)}
      />
    </Modal>
  )
}
