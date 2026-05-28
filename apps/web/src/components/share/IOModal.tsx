'use client'

import { useState, useRef, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { ImportNotice } from '@/components/share/ImportNotice'
import { exportRoadmap } from '@/services/roadmap-crud.service'
import { useRoadmap } from '@/context/RoadmapContext'
import { parseImportedRoadmapJson, IMPORT_MAX_BYTES } from '@/lib/roadmap-validation'
import type { ImportedRoadmap } from '@/lib/roadmap-validation'
import { upgradeRoadmapSnapshot, type RoadmapUpgradeNotice } from '@/lib/roadmap-upgrade'
import type { Phase } from '@/types/roadmap'
import { AI_ROADMAP_TEMPLATE } from '@/lib/ai-roadmap-template'

interface IOModalProps {
  open: boolean
  onClose: () => void
  onToast: (msg: string) => void
  onRoadmapImported?: (roadmapName: string | undefined, phases: Phase[]) => void
}

type Tab = 'export' | 'import'
type ImportMode = 'replace-current' | 'new-local'
type ReplaceImportScope = 'synced' | 'local'

function updateUrlForLocalRoadmap(roadmapId: string): void {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', `/workspace?roadmap=${encodeURIComponent(roadmapId)}`)
}

interface PendingImport {
  result: ImportedRoadmap
  mode: ImportMode
  upgradeNotices: RoadmapUpgradeNotice[]
  replaceScope: ReplaceImportScope
}

export function IOModal({ open, onClose, onToast, onRoadmapImported }: IOModalProps) {
  const [tab, setTab] = useState<Tab>('export')
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const {
    roadmapName,
    phases,
    setPhases,
    setRoadmapName,
    setSaved,
    createLocalRoadmap,
    resetToSample,
    saved,
    serverRoadmapId,
    role,
    ownerDisplayName,
    updatedAt,
  } = useRoadmap()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importModeRef = useRef<ImportMode>('replace-current')
  const canReplaceCurrent = !serverRoadmapId || role === 'owner' || role === 'editor'

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const slug = (value: string) => value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'roadmap'

  const padDatePart = (value: number) => String(value).padStart(2, '0')

  const formatExportTimestamp = (date = new Date()) => {
    const year = date.getFullYear()
    const month = padDatePart(date.getMonth() + 1)
    const day = padDatePart(date.getDate())
    const hours = padDatePart(date.getHours())
    const minutes = padDatePart(date.getMinutes())
    return `${year}${month}${day}-${hours}${minutes}`
  }

  const jsonExportFilename = () =>
    `${slug(roadmapName)}.${formatExportTimestamp()}.roadforge.json`

  const exportMetadata = {
    roadmapName,
    saved,
    serverRoadmapId,
    role,
    ownerDisplayName,
    updatedAt,
  }

  const handleJsonExport = async () => {
    try {
      const blob = await exportRoadmap(phases, 'json', exportMetadata)
      downloadBlob(blob, jsonExportFilename())
      onToast('JSON file downloaded')
      onClose()
    } catch {
      onToast('Export failed. Could not create JSON file.')
    }
  }

  const handleAITemplateExport = () => {
    try {
      const blob = new Blob([AI_ROADMAP_TEMPLATE], { type: 'text/plain;charset=utf-8' })
      downloadBlob(blob, 'roadforge-ai-roadmap-template.txt')
      onToast('AI roadmap template downloaded')
    } catch {
      onToast('Export failed. Could not create template file.')
    }
  }

  const selectImportFile = (mode: ImportMode) => {
    importModeRef.current = mode
    fileInputRef.current?.click()
  }

  const executeImport = useCallback((imported: ImportedRoadmap, mode: ImportMode) => {
    const nextName = imported.roadmapName || roadmapName
    if (mode === 'replace-current') {
      if (!canReplaceCurrent) {
        onToast('Viewers can import as a new local roadmap only.')
        return
      }
      setPhases(imported.phases)
      if (imported.roadmapName) setRoadmapName(imported.roadmapName)
      setSaved(false)
      onToast(serverRoadmapId ? 'Roadmap replaced — syncing after autosave' : 'Roadmap replaced from JSON')
    } else {
      const newId = createLocalRoadmap(nextName, imported.phases)
      updateUrlForLocalRoadmap(newId)
      onToast('Imported as new local roadmap')
    }
    onRoadmapImported?.(imported.roadmapName, imported.phases)
    onClose()
  }, [roadmapName, canReplaceCurrent, setPhases, setRoadmapName, setSaved, serverRoadmapId,
      createLocalRoadmap, onRoadmapImported, onClose, onToast])

  const handleClose = useCallback(() => {
    setPendingImport(null)
    onClose()
  }, [onClose])

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > IMPORT_MAX_BYTES) {
      onToast('Import failed — file is too large')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = parseImportedRoadmapJson(ev.target?.result as string)
        const upgraded = upgradeRoadmapSnapshot({
          roadmapName: parsed.roadmapName,
          phases: parsed.phases,
        })
        const imported: ImportedRoadmap = {
          ...parsed,
          roadmapName: upgraded.roadmapName || parsed.roadmapName,
          phases: upgraded.phases,
        }
        const mode = importModeRef.current
        const hasNotices = imported.warnings.length > 0 ||
          imported.repairs.length > 0 ||
          upgraded.notices.length > 0
        if (mode === 'replace-current' || hasNotices) {
          setPendingImport({
            result: imported,
            mode,
            upgradeNotices: upgraded.notices,
            replaceScope: serverRoadmapId ? 'synced' : 'local',
          })
        } else {
          executeImport(imported, mode)
        }
      } catch (err) {
        onToast(err instanceof Error ? err.message : 'Import failed: invalid roadmap file.')
      }
    }
    reader.readAsText(file)
    // reset so the same file can be re-selected
    e.target.value = ''
  }

  const handleReset = () => {
    resetToSample()
    onToast('Roadmap reset to sample data')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      width={540}
      icon={{ name: tab === 'export' ? 'export' : 'import', plain: true }}
      title={tab === 'export' ? 'Export roadmap' : 'Import roadmap'}
      sub="JSON is the only supported import/export format for now."
      footer={
        <>
          <span className="note">No data leaves your device.</span>
          <span className="spacer" />
          <button className="back" onClick={handleClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="io-tab">
        <button
          className={tab === 'export' ? 'active' : ''}
          onClick={() => { setTab('export'); setPendingImport(null) }}
        >
          Export
        </button>
        <button
          className={tab === 'import' ? 'active' : ''}
          onClick={() => setTab('import')}
        >
          Import
        </button>
      </div>

      {tab === 'export' ? (
        <div className="io-actions">
          <button
            type="button"
            className="io-action primary"
            onClick={handleJsonExport}
            aria-label="Export JSON"
          >
            <span className="io-action-icon">
              <Icon name="export" size={15} />
            </span>
            <span className="io-action-copy">
              <span className="io-action-title">Export JSON</span>
              <span className="io-action-desc">
                Portable RoadForge backup. Includes phases, tasks, dependencies,
                tags, and status.
              </span>
              <span className="io-action-note">
                Does not include invite links, sessions, passwords, or browser auth.
              </span>
            </span>
            <span className="io-action-go" aria-hidden>
              <Icon name="arrow-right" size={15} />
            </span>
          </button>

          <button
            type="button"
            className="io-action"
            onClick={handleAITemplateExport}
            aria-label="Export AI roadmap template"
          >
            <span className="io-action-icon">
              <Icon name="robot" size={15} />
            </span>
            <span className="io-action-copy">
              <span className="io-action-title">Export AI roadmap template</span>
              <span className="io-action-desc">
                Download a prompt template for an AI assistant to generate a valid
                RoadForge JSON roadmap.
              </span>
            </span>
            <span className="io-action-go" aria-hidden>
              <Icon name="arrow-right" size={15} />
            </span>
          </button>
        </div>
      ) : pendingImport ? (
        <ImportNotice
          pendingImport={pendingImport}
          onConfirm={() => {
            const p = pendingImport
            setPendingImport(null)
            executeImport(p.result, p.mode)
          }}
          onCancel={() => setPendingImport(null)}
        />
      ) : (
        <>
          <div className="io-actions">
            <button
              type="button"
              className="io-action primary"
              onClick={() => selectImportFile('new-local')}
              aria-label="Import as new local roadmap"
            >
              <span className="io-action-icon">
                <Icon name="plus" size={15} />
              </span>
              <span className="io-action-copy">
                <span className="io-action-title">Import as new local roadmap</span>
                <span className="io-action-desc">
                  Safer option: create and activate a separate local draft.
                  Collaborators are not affected.
                </span>
                <span className="io-action-note">
                  Keeps your current roadmap unchanged.
                </span>
              </span>
              <span className="io-action-go" aria-hidden>
                <Icon name="arrow-right" size={15} />
              </span>
            </button>

            <button
              type="button"
              className="io-action destructive"
              onClick={() => selectImportFile('replace-current')}
              disabled={!canReplaceCurrent}
              aria-label="Replace current roadmap from JSON"
            >
              <span className="io-action-icon">
                <Icon name="import" size={15} />
              </span>
              <span className="io-action-copy">
                <span className="io-action-title">Replace current roadmap</span>
                <span className="io-action-desc">
                  {serverRoadmapId
                    ? 'Destructive: overwrite this shared roadmap with the imported file.'
                    : 'Destructive: overwrite this local draft with the imported file.'}
                </span>
                <span className="io-action-note">
                  Requires confirmation. Keeps the current roadmap ID, session, and switcher entry.
                </span>
              </span>
              <span className="io-action-go" aria-hidden>
                <Icon name="arrow-right" size={15} />
              </span>
            </button>
          </div>
          <div className="note-line compact">
            <span className="ic">
              <Icon name="shield" size={14} />
            </span>
            <span>
              JSON imports preserve phases, tasks, tags, assignees, dependencies, and status.
              Export a backup first if needed.
            </span>
          </div>
          <button
            type="button"
            className="back inline-reset"
            onClick={handleReset}
          >
            Restore starter roadmap
          </button>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />
    </Modal>
  )
}
