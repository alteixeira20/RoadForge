'use client'

import { Icon } from '@/components/ui/Icon'
import type { ImportedRoadmap } from '@/lib/roadmap-validation'
import type { RoadmapUpgradeNotice } from '@/lib/roadmap-upgrade'

type ImportMode = 'replace-current' | 'new-local'
type ReplaceImportScope = 'synced' | 'local'

interface PendingImport {
  result: ImportedRoadmap
  mode: ImportMode
  upgradeNotices: RoadmapUpgradeNotice[]
  replaceScope: ReplaceImportScope
}

interface ImportNoticeProps {
  pendingImport: PendingImport
  onConfirm: () => void
  onCancel: () => void
}

export function ImportNotice({ pendingImport, onConfirm, onCancel }: ImportNoticeProps) {
  const isReplace = pendingImport.mode === 'replace-current'
  const hasNotices = pendingImport.result.repairs.length > 0 ||
    pendingImport.result.warnings.length > 0 ||
    pendingImport.upgradeNotices.length > 0

  return (
    <>
      <div className="note-line warning">
        <span className="ic">
          <Icon name="shield" size={14} />
        </span>
        <div>
          <strong style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--ink)' }}>
            {isReplace ? 'Confirm replacement' : 'Import notice'}
          </strong>
          {isReplace && (
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 6 }}>
              {pendingImport.replaceScope === 'synced'
                ? 'This will overwrite the current roadmap contents. After save or autosync, the replacement can sync to collaborators.'
                : 'This will overwrite the current local draft with the imported roadmap contents.'}
            </span>
          )}
          {pendingImport.result.repairs.length > 0 && (
            <>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 4 }}>
                RoadForge repaired minor compatibility issues so this file can be imported safely.
              </span>
              <ul style={{ margin: '0 0 6px', paddingLeft: 16, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                {pendingImport.result.repairs.map((r, i) => (
                  <li key={i}>{r.message}</li>
                ))}
              </ul>
            </>
          )}
          {pendingImport.result.warnings.length > 0 && (
            <ul style={{ margin: '0 0 6px', paddingLeft: 16, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              {pendingImport.result.warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          )}
          {pendingImport.upgradeNotices.length > 0 && (
            <ul style={{ margin: '0 0 6px', paddingLeft: 16, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              {pendingImport.upgradeNotices.map((notice, i) => (
                <li key={i}>{notice.message}</li>
              ))}
            </ul>
          )}
          {hasNotices && (
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              This file will still import successfully.
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={isReplace ? 'btn sm danger' : 'btn sm primary'}
          onClick={onConfirm}
        >
          {pendingImport.mode === 'replace-current'
            ? 'Confirm replace current roadmap'
            : 'Import as new local roadmap'}
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
