'use client'

import { useState, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { ImportActions } from '@/components/share/ImportActions'
import { ImportNotice } from '@/components/share/ImportNotice'
import { useImportFlow } from '@/components/share/useImportFlow'
import { exportRoadmap } from '@/services/roadmap-crud.service'
import { useRoadmap } from '@/context/RoadmapContext'
import type { Phase } from '@/types/roadmap'
import { AI_ROADMAP_TEMPLATE } from '@/lib/ai-roadmap-template'

interface IOModalProps {
  open: boolean
  onClose: () => void
  onToast: (msg: string) => void
  onRoadmapImported?: (roadmapName: string | undefined, phases: Phase[]) => void
}

type Tab = 'export' | 'import'

export function IOModal({ open, onClose, onToast, onRoadmapImported }: IOModalProps) {
  const [tab, setTab] = useState<Tab>('export')
  const {
    roadmapName,
    phases,
    tagRegistry,
    setPhases,
    setRoadmapName,
    setSaved,
    setTagRegistry,
    createLocalRoadmap,
    resetToSample,
    saved,
    serverRoadmapId,
    role,
    ownerDisplayName,
    updatedAt,
  } = useRoadmap()
  const canReplaceCurrent = !serverRoadmapId || role === 'owner' || role === 'editor'
  const {
    fileInputRef,
    pendingImport,
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
    setPhases,
    setRoadmapName,
    setSaved,
    setTagRegistry,
    createLocalRoadmap,
    onRoadmapImported,
    onClose,
    onToast,
  })

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
      downloadBlob(blob, 'roadforge-ai-roadmap-template.txt')
      onToast('AI roadmap template downloaded')
    } catch {
      onToast('Export failed. Could not create template file.')
    }
  }

  const handleClose = useCallback(() => {
    handleCancelPendingImport()
    onClose()
  }, [handleCancelPendingImport, onClose])

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
          onClick={() => { setTab('export'); handleCancelPendingImport() }}
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
          onConfirm={handleConfirm}
          onCancel={handleCancelPendingImport}
        />
      ) : (
        <>
          <ImportActions
            canReplaceCurrent={canReplaceCurrent}
            serverRoadmapId={serverRoadmapId}
            onSelectImportFile={selectImportFile}
          />
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
