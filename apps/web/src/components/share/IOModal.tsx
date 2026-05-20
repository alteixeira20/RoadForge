'use client'

import { useState, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { exportRoadmap } from '@/services/roadmap.service'
import { useRoadmap } from '@/context/RoadmapContext'
import { parseImportedRoadmapJson, IMPORT_MAX_BYTES } from '@/lib/roadmap-validation'
import type { Phase } from '@/types/roadmap'

interface IOModalProps {
  open: boolean
  onClose: () => void
  onToast: (msg: string) => void
  onRoadmapImported?: (roadmapName: string | undefined, phases: Phase[]) => void
}

type Tab = 'export' | 'import'

const AI_ROADMAP_TEMPLATE = `# RoadForge AI Roadmap Template

Create a RoadForge roadmap JSON file that can be imported into RoadForge.

Use this template to gather context, then produce a final .json file for RoadForge.

## Fill in

Project name:

Product goal:

Existing completed work:

Pending features:

Deployment target:

Constraints:

Preferred phases:

Priority rules:

## Valid schema example

\`\`\`json
{
  "schema": "roadforge.roadmap.import",
  "version": 1,
  "roadmap": {
    "name": "Example Roadmap"
  },
  "phases": [
    {
      "id": "phase-01",
      "num": "01",
      "name": "Foundation",
      "color": "#f5853f",
      "status": "active",
      "progress": 25,
      "tasks": [
        {
          "id": "RF-101",
          "title": "Define MVP scope",
          "done": true,
          "next": false,
          "est": "1 day",
          "tags": ["planning"],
          "deps": [],
          "desc": "Write the scope that guides the first build."
        },
        {
          "id": "RF-102",
          "title": "Draft implementation plan",
          "done": false,
          "next": true,
          "est": "2 days",
          "tags": ["planning"],
          "deps": ["RF-101"],
          "desc": "Convert scope into sequenced work.",
          "parentId": "RF-101"
        }
      ]
    }
  ]
}
\`\`\`

## RoadForge constraints

- Status values: done, active, next, future.
- Progress must be a number from 0 to 100.
- Task IDs should be stable and readable, for example RF-101.
- Dependencies use task IDs in deps.
- Subtasks use parentId set to another task ID.
- Optional task fields: next, est, tags, deps, desc, parentId.
- Use double quotes and do not include trailing commas.
- Do not include session tokens, invite tokens, passwords, auth cache, or browser storage data.

## Final AI instruction

Return only the final JSON. Do not wrap it in Markdown. Do not include comments.
`

export function IOModal({ open, onClose, onToast, onRoadmapImported }: IOModalProps) {
  const [tab, setTab] = useState<Tab>('export')
  const {
    roadmapName,
    phases,
    setPhases,
    setRoadmapName,
    setSaved,
    setServerRoadmapId,
    setSessionToken,
    setParticipantId,
    setRole,
    resetToSample,
    saved,
    serverRoadmapId,
    role,
    ownerDisplayName,
    updatedAt,
  } = useRoadmap()
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      downloadBlob(blob, `${slug(roadmapName)}.roadforge.json`)
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
        const imported = parseImportedRoadmapJson(ev.target?.result as string)
        setPhases(imported.phases)
        if (imported.roadmapName) setRoadmapName(imported.roadmapName)
        setServerRoadmapId(null)
        setSessionToken(null)
        setParticipantId(null)
        setRole(null)
        setSaved(false)
        onRoadmapImported?.(imported.roadmapName, imported.phases)
        onToast('Roadmap imported from JSON')
        onClose()
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
      onClose={onClose}
      width={540}
      icon={{ name: tab === 'export' ? 'export' : 'import', plain: true }}
      title={tab === 'export' ? 'Export roadmap' : 'Import roadmap'}
      sub="JSON is the only supported import/export format for now."
      footer={
        <>
          <span className="note">No data leaves your device.</span>
          <span className="spacer" />
          <button className="back" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="io-tab">
        <button
          className={tab === 'export' ? 'active' : ''}
          onClick={() => setTab('export')}
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
      ) : (
        <>
          <div className="io-actions">
            <button
              type="button"
              className="io-action primary"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Import JSON"
            >
              <span className="io-action-icon">
                <Icon name="import" size={15} />
              </span>
              <span className="io-action-copy">
                <span className="io-action-title">Import JSON</span>
                <span className="io-action-desc">
                  Import a RoadForge JSON file or raw phases array.
                </span>
              </span>
              <span className="io-action-go" aria-hidden>
                <Icon name="arrow-right" size={15} />
              </span>
            </button>

            <button
              type="button"
              className="io-action"
              onClick={handleReset}
              aria-label="Restore starter roadmap"
            >
              <span className="io-action-icon">
                <Icon name="shield" size={15} />
              </span>
              <span className="io-action-copy">
                <span className="io-action-title">Restore starter roadmap</span>
                <span className="io-action-desc">
                  Replace the current roadmap with the default starter roadmap.
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
              Importing replaces the current local roadmap. Export a backup first if
              needed.
            </span>
          </div>
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
