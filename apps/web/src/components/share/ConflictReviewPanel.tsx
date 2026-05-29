'use client'

import { useState } from 'react'
import type { ImportConflict } from '@/lib/import-merge/types'

interface ConflictItemProps {
  conflict: ImportConflict
  index: number
}

function ConflictItem({ conflict, index }: ConflictItemProps) {
  const [open, setOpen] = useState(false)
  const diffs = conflict.fieldDiffs ?? []
  const diffCount = diffs.length

  return (
    <div className="conflict-item">
      <button
        type="button"
        className={`conflict-item-header${open ? ' is-open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="conflict-item-index">{index + 1}</span>
        <span className="conflict-item-title">
          {conflict.importedTitle ?? conflict.importedId}
        </span>
        {conflict.phaseName && (
          <span className="conflict-item-phase">{conflict.phaseName}</span>
        )}
        <span className="conflict-item-count">
          {diffCount} field{diffCount !== 1 ? 's' : ''} differ
        </span>
        <span className="conflict-item-caret" aria-hidden>▸</span>
      </button>

      {open && diffs.length > 0 && (
        <div className="conflict-diff-body">
          {diffs.map((diff, i) => (
            <div key={i} className="conflict-diff-row">
              <span className="conflict-diff-field">{diff.field}</span>
              <span className="conflict-diff-current" title="Current value">{diff.current}</span>
              <span className="conflict-diff-arrow">→</span>
              <span className="conflict-diff-imported" title="Imported value">{diff.imported}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface ConflictReviewPanelProps {
  conflicts: ImportConflict[]
}

export function ConflictReviewPanel({ conflicts }: ConflictReviewPanelProps) {
  const [listOpen, setListOpen] = useState(false)
  const count = conflicts.length
  if (count === 0) return null

  return (
    <div className="conflict-panel">
      <button
        type="button"
        className={`conflict-panel-toggle${listOpen ? ' is-open' : ''}`}
        onClick={() => setListOpen(!listOpen)}
        aria-expanded={listOpen}
      >
        <span className="conflict-panel-count">{count} task{count !== 1 ? 's' : ''} skipped</span>
        <span className="conflict-panel-hint">— existing values kept, imports differ</span>
        <span className="conflict-panel-action">{listOpen ? 'Hide details ▴' : 'Show details ▾'}</span>
      </button>

      {listOpen && (
        <div className="conflict-panel-list">
          {conflicts.map((c, i) => (
            <ConflictItem key={c.importedId + i} conflict={c} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
