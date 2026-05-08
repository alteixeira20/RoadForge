'use client'

import { useState, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { EXPORT_OPTIONS } from '@/data/sample-roadmap'
import { exportRoadmap } from '@/services/roadmap.service'
import { useRoadmap } from '@/context/RoadmapContext'
import { storage } from '@/lib/storage'
import type { IconName } from '@/components/ui/Icon'
import type { Phase } from '@/types/roadmap'

interface IOModalProps {
  open: boolean
  onClose: () => void
  onToast: (msg: string) => void
}

type Tab = 'export' | 'import'

function isValidPhaseArray(v: unknown): v is Phase[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    typeof (v[0] as Phase)?.id === 'string' &&
    Array.isArray((v[0] as Phase)?.tasks)
  )
}

export function IOModal({ open, onClose, onToast }: IOModalProps) {
  const [tab, setTab] = useState<Tab>('export')
  const { phases, setPhases, resetToSample } = useRoadmap()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleJsonExport = async () => {
    try {
      const blob = await exportRoadmap(phases, 'json')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'roadmap.json'
      a.click()
      URL.revokeObjectURL(url)
      onToast('JSON file downloaded')
      onClose()
    } catch {
      onToast('Export failed — try again')
    }
  }

  const handleExportClick = (id: string, name: string) => {
    if (id === 'json') {
      handleJsonExport()
      return
    }
    onToast(`${name} export requires backend`)
  }

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        const incoming = parsed?.phases ?? parsed
        if (!isValidPhaseArray(incoming)) {
          onToast('Invalid file — expected a Roadforge JSON export')
          return
        }
        setPhases(incoming)
        storage.setPhases(incoming)
        onToast('Roadmap imported from JSON')
        onClose()
      } catch {
        onToast('Could not parse file — is it valid JSON?')
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
      width={580}
      icon={{ name: tab === 'export' ? 'export' : 'import', plain: true }}
      title={tab === 'export' ? 'Export roadmap' : 'Import roadmap'}
      sub="JSON is the portable source-of-truth format. Markdown and PDF are read-only snapshots."
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
        <div className="io-grid">
          {EXPORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`io-card ${opt.id === 'json' ? 'recommended' : ''}`}
              onClick={() => handleExportClick(opt.id, opt.name)}
            >
              <div className="h">
                <span className="ic">
                  <Icon name={opt.icon as IconName} size={14} />
                </span>
                <span className="nm">{opt.name}</span>
                {opt.badge && <span className="badge">{opt.badge}</span>}
              </div>
              <div className="d">{opt.desc}</div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="io-grid">
            <button
              className="io-card recommended"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="h">
                <span className="ic">
                  <Icon name="import" size={14} />
                </span>
                <span className="nm">From JSON</span>
                <span className="badge">Recommended</span>
              </div>
              <div className="d">
                Pick a Roadforge JSON file from disk.
              </div>
            </button>
            <button
              className="io-card"
              onClick={() => onToast('Markdown import requires backend')}
            >
              <div className="h">
                <span className="ic">
                  <Icon name="import" size={14} />
                </span>
                <span className="nm">From Markdown</span>
              </div>
              <div className="d">
                A simple checklist file with phase headings.
              </div>
            </button>
          </div>
          <div className="note-line">
            <span className="ic">
              <Icon name="shield" size={14} />
            </span>
            <span>
              Importing replaces the current roadmap. We&apos;ll keep an undo for one
              minute.
            </span>
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
            <button
              className="btn ghost"
              style={{ fontSize: 12, opacity: 0.6 }}
              onClick={handleReset}
            >
              Reset to sample roadmap
            </button>
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleJsonImport}
      />
    </Modal>
  )
}
