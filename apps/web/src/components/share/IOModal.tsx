'use client'

import { useState, useCallback, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { ImportActions } from '@/components/share/ImportActions'
import { ImportNotice } from '@/components/share/ImportNotice'
import { useImportFlow } from '@/components/share/useImportFlow'
import { exportRoadmap } from '@/services/roadmap-crud.service'
import { useRoadmap } from '@/context/RoadmapContext'
import type { Phase } from '@/types/roadmap'
import type { ImportMode } from '@/lib/import-merge/types'
import { AI_ROADMAP_TEMPLATE } from '@/lib/ai-roadmap-template'

interface IOModalProps {
  open: boolean
  onClose: () => void
  onToast: (msg: string) => void
  onRoadmapImported?: (
    roadmapName: string | undefined,
    phases: Phase[],
    mode: ImportMode,
  ) => void
}

type IOMode = 'export' | ImportMode

const MODE_TABS: Array<{ id: IOMode; label: string }> = [
  { id: 'export', label: 'Export' },
  { id: 'new-local', label: 'Import as new copy' },
  { id: 'safe-additions', label: 'Merge into current' },
  { id: 'replace-current', label: 'Replace current' },
]

export function IOModal({ open, onClose, onToast, onRoadmapImported }: IOModalProps) {
  const [mode, setMode] = useState<IOMode>('new-local')
  const {
    roadmapName,
    phases,
    tagRegistry,
    setPhases,
    setRoadmapName,
    setSaved,
    setTagRegistry,
    createLocalRoadmap,
    saved,
    serverRoadmapId,
    sessionToken,
    role,
    ownerDisplayName,
    updatedAt,
  } = useRoadmap()
  const canReplaceCurrent = !serverRoadmapId || role === 'owner' || role === 'editor'
  const {
    fileInputRef,
    pendingImport,
    importError,
    isConfirming,
    selectImportFile,
    handleImportFile,
    handleConfirm,
    handleCancelPendingImport,
  } = useImportFlow({
    roadmapName,
    phases,
    tagRegistry,
    canReplaceCurrent,
    serverRoadmapId,
    sessionToken,
    setPhases,
    setRoadmapName,
    setSaved,
    setTagRegistry,
    createLocalRoadmap,
    onRoadmapImported,
    onClose,
    onToast,
  })

  useEffect(() => {
    if (!open) return
    setMode('new-local')
    handleCancelPendingImport()
  }, [open, handleCancelPendingImport])

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
    tagRegistry,
  }

  const handleJsonExport = async () => {
    try {
      onToast('Preparing JSON export...')
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
      onToast('Preparing AI roadmap template...')
      const blob = new Blob([AI_ROADMAP_TEMPLATE], { type: 'text/plain;charset=utf-8' })
      downloadBlob(blob, 'anvilary-ai-roadmap-template.txt')
      onToast('AI roadmap template downloaded')
    } catch {
      onToast('Export failed. Could not create template file.')
    }
  }

  const handleClose = useCallback(() => {
    if (isConfirming) return
    handleCancelPendingImport()
    onClose()
  }, [handleCancelPendingImport, isConfirming, onClose])

  const selectMode = (nextMode: IOMode) => {
    if (isConfirming) return
    setMode(nextMode)
    handleCancelPendingImport()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      width={560}
      icon={{ name: mode === 'export' ? 'export' : 'import', plain: true }}
      title="Import / Export roadmap"
      sub="Choose one action. JSON is the supported roadmap format."
      footer={
        <>
          <span className="note">Exports and file previews stay on this device.</span>
          <span className="spacer" />
          <button className="back" onClick={handleClose} disabled={isConfirming}>
            Cancel
          </button>
        </>
      }
    >
      <div className="io-tab" role="group" aria-label="Import or export mode">
        {MODE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={mode === tab.id ? 'active' : ''}
            aria-pressed={mode === tab.id}
            onClick={() => selectMode(tab.id)}
            disabled={isConfirming}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'export' ? (
        <section className="io-mode-panel">
          <div className="io-mode-copy">
            <strong>Download a portable roadmap backup</strong>
            <p>
              Includes phases, tasks, dependencies, tags, and status. Sessions,
              invite links, passwords, and browser authentication are excluded.
            </p>
          </div>
          <button
            type="button"
            className="btn sm primary io-primary-action"
            onClick={handleJsonExport}
          >
            <Icon name="export" size={14} />
            Download .roadforge.json
          </button>

          <button
            type="button"
            className="io-secondary-action"
            onClick={handleAITemplateExport}
          >
            <Icon name="robot" size={14} />
            Download AI roadmap template
          </button>
        </section>
      ) : pendingImport ? (
        <ImportNotice
          pendingImport={pendingImport}
          onConfirm={handleConfirm}
          onCancel={handleCancelPendingImport}
          error={importError}
          isConfirming={isConfirming}
        />
      ) : (
        <ImportActions
          mode={mode}
          canReplaceCurrent={canReplaceCurrent}
          serverRoadmapId={serverRoadmapId}
          onSelectImportFile={selectImportFile}
        />
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
