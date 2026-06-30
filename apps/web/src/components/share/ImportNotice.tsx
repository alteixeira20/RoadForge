'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ImportConflictReviewPanel } from '@/components/share/ImportConflictReviewPanel'
import type { PendingImport } from '@/lib/import-merge/types'

interface ImportNoticeProps {
  pendingImport: PendingImport
  onConfirm: () => void
  onCancel: () => void
}

// ─── Sub-sections ──────────────────────────────────────────────────────────────

function MergeSummaryLines({ pendingImport }: { pendingImport: PendingImport }) {
  const p = pendingImport.mergePreview
  if (!p) return null
  return (
    <ul className="import-summary-list">
      {p.phasesAdded > 0 && <li>{p.phasesAdded} new phase{p.phasesAdded !== 1 ? 's' : ''} will be added.</li>}
      {p.tasksAdded > 0 && <li>{p.tasksAdded} new task{p.tasksAdded !== 1 ? 's' : ''} will be added.</li>}
      {p.tagsAdded > 0 && <li>{p.tagsAdded} new tag{p.tagsAdded !== 1 ? 's' : ''} will be added.</li>}
      {p.matchedPhases > 0 && <li>{p.matchedPhases} existing phase{p.matchedPhases !== 1 ? 's' : ''} matched — not modified.</li>}
      {p.matchedTasks > 0 && <li>{p.matchedTasks} existing task{p.matchedTasks !== 1 ? 's' : ''} matched — not modified.</li>}
      {p.phasesAdded === 0 && p.tasksAdded === 0 && p.tagsAdded === 0 && (
        <li>No new content to add — everything already exists in the current roadmap.</li>
      )}
    </ul>
  )
}

function RepairsAndWarnings({ pendingImport }: { pendingImport: PendingImport }) {
  const { repairs, warnings } = pendingImport.result
  const { upgradeNotices } = pendingImport
  const hasAny = repairs.length > 0 || warnings.length > 0 || upgradeNotices.length > 0
  if (!hasAny) return null
  return (
    <>
      {repairs.length > 0 && (
        <>
          <span className="import-compat-note">
            RoadForge repaired minor compatibility issues so this file can be imported safely.
          </span>
          <ul className="import-summary-list">
            {repairs.map((r, i) => <li key={i}>{r.message}</li>)}
          </ul>
        </>
      )}
      {warnings.length > 0 && (
        <ul className="import-summary-list">
          {warnings.map((w, i) => <li key={i}>{w.message}</li>)}
        </ul>
      )}
      {upgradeNotices.length > 0 && (
        <ul className="import-summary-list">
          {upgradeNotices.map((n, i) => <li key={i}>{n.message}</li>)}
        </ul>
      )}
      <span className="import-compat-success">
        This file will still import successfully.
      </span>
    </>
  )
}

// ─── Danger confirmation section (replace-current only) ───────────────────────

interface DangerConfirmProps {
  pendingImport: PendingImport
  acknowledged: boolean
  onAcknowledge: (checked: boolean) => void
}

function DangerConfirmSection({ pendingImport, acknowledged, onAcknowledge }: DangerConfirmProps) {
  const { currentStats, result, replaceScope } = pendingImport
  const importedPhaseCount = pendingImport.mergePreview?.phasesAdded ?? result.phases.length
  const importedTaskCount = pendingImport.mergePreview?.tasksAdded ?? result.phases.reduce((sum, p) => sum + p.tasks.length, 0)

  return (
    <div className="danger-confirm-section">
      {currentStats && (
        <div className="danger-stats-grid">
          <div className="danger-stats-row current">
            <span className="danger-stats-label">Current roadmap</span>
            <span className="danger-stats-value">
              {currentStats.phaseCount} phase{currentStats.phaseCount !== 1 ? 's' : ''}, {currentStats.taskCount} task{currentStats.taskCount !== 1 ? 's' : ''}
            </span>
            <span className="danger-stats-fate">will be removed</span>
          </div>
          <div className="danger-stats-row imported">
            <span className="danger-stats-label">Imported file</span>
            <span className="danger-stats-value">
              {importedPhaseCount} phase{importedPhaseCount !== 1 ? 's' : ''}, {importedTaskCount} task{importedTaskCount !== 1 ? 's' : ''}
            </span>
            <span className="danger-stats-fate">will replace it</span>
          </div>
        </div>
      )}
      <label className="danger-ack-label">
        <input
          type="checkbox"
          className="danger-ack-checkbox"
          checked={acknowledged}
          onChange={(e) => onAcknowledge(e.target.checked)}
        />
        <span>
          {replaceScope === 'synced'
            ? 'I understand this will permanently overwrite the shared roadmap for all collaborators.'
            : 'I understand this will permanently overwrite my current roadmap content.'}
        </span>
      </label>
    </div>
  )
}

// ─── Header helpers ────────────────────────────────────────────────────────────

function importTitle(pendingImport: PendingImport): string {
  if (pendingImport.mode === 'safe-additions') return 'Confirm safe merge'
  if (pendingImport.mode === 'replace-current') return 'Confirm replacement'
  return 'Import preview'
}

function importDescription(pendingImport: PendingImport): string {
  const { mode, result, replaceScope } = pendingImport
  const name = result.roadmapName ? `"${result.roadmapName}"` : 'the imported roadmap'
  const phaseCount = mode === 'safe-additions'
    ? result.phases.length
    : pendingImport.mergePreview?.phasesAdded ?? result.phases.length
  const taskCount = mode === 'safe-additions'
    ? result.phases.reduce((sum, p) => sum + p.tasks.length, 0)
    : pendingImport.mergePreview?.tasksAdded ?? result.phases.reduce((sum, p) => sum + p.tasks.length, 0)
  const counts = `${phaseCount} phase${phaseCount !== 1 ? 's' : ''}, ${taskCount} task${taskCount !== 1 ? 's' : ''}`

  if (mode === 'safe-additions') {
    return `Merging ${name} (${counts}). Only new phases and tasks will be added. No existing data will be changed.`
  }
  if (mode === 'replace-current') {
    return replaceScope === 'synced'
      ? `This will overwrite the shared roadmap with ${name} (${counts}).`
      : `This will overwrite the current local draft with ${name} (${counts}).`
  }
  return `Importing ${name} as a new local roadmap (${counts}).`
}

function confirmLabel(mode: PendingImport['mode']): string {
  if (mode === 'safe-additions') return 'Merge safe additions'
  if (mode === 'replace-current') return 'Confirm replace current roadmap'
  return 'Import as new local roadmap'
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ImportNotice({ pendingImport, onConfirm, onCancel }: ImportNoticeProps) {
  const [acknowledged, setAcknowledged] = useState(false)
  const { mode } = pendingImport
  const isReplace = mode === 'replace-current'
  const isMerge = mode === 'safe-additions'
  const conflicts = pendingImport.mergePreview?.conflicts ?? []

  const hasNoAdditions =
    isMerge &&
    (pendingImport.mergePreview?.phasesAdded ?? 0) === 0 &&
    (pendingImport.mergePreview?.tasksAdded ?? 0) === 0 &&
    (pendingImport.mergePreview?.tagsAdded ?? 0) === 0

  const confirmDisabled =
    (isMerge && hasNoAdditions) ||
    (isReplace && !acknowledged)

  return (
    <>
      <div className={`note-line ${isReplace ? 'warning' : ''}`}>
        <span className="ic">
          <Icon name={isMerge ? 'import' : 'shield'} size={14} />
        </span>
        <div>
          <strong className="import-notice-title">
            {importTitle(pendingImport)}
          </strong>
          <span className="import-notice-description">
            {importDescription(pendingImport)}
          </span>

          {isMerge && (
            <>
              <MergeSummaryLines pendingImport={pendingImport} />
              <RepairsAndWarnings pendingImport={pendingImport} />
            </>
          )}

          {!isMerge && <RepairsAndWarnings pendingImport={pendingImport} />}
        </div>
      </div>

      {isMerge && conflicts.length > 0 && (
        <ImportConflictReviewPanel conflicts={conflicts} />
      )}

      {isReplace && (
        <DangerConfirmSection
          pendingImport={pendingImport}
          acknowledged={acknowledged}
          onAcknowledge={setAcknowledged}
        />
      )}

      <div className="import-notice-actions">
        <button
          type="button"
          className={isReplace ? 'btn sm danger' : 'btn sm primary'}
          onClick={onConfirm}
          disabled={confirmDisabled}
        >
          {confirmLabel(mode)}
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </>
  )
}
