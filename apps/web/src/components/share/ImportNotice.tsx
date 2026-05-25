'use client'

import { Icon } from '@/components/ui/Icon'
import type { ImportedRoadmap } from '@/lib/roadmap-validation'
import type { RoadmapUpgradeNotice } from '@/lib/roadmap-upgrade'

type ImportMode = 'replace-current' | 'new-local'

interface PendingImport {
  result: ImportedRoadmap
  mode: ImportMode
  upgradeNotices: RoadmapUpgradeNotice[]
}

interface ImportNoticeProps {
  pendingImport: PendingImport
  onConfirm: () => void
  onCancel: () => void
}

export function ImportNotice({ pendingImport, onConfirm, onCancel }: ImportNoticeProps) {
  return (
    <>
      <div className="note-line warning">
        <span className="ic">
          <Icon name="shield" size={14} />
        </span>
        <div>
          <strong style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--ink)' }}>
            Import notice
          </strong>
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
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            This file will still import successfully.
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn sm primary"
          onClick={onConfirm}
        >
          {pendingImport.mode === 'replace-current'
            ? 'Replace current roadmap'
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
