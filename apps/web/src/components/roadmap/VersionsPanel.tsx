'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { getRoadmapVersions, restoreRoadmapVersion } from '@/services/roadmap.service'
import type { Roadmap, RoadmapVersionSummary } from '@/types/roadmap'

interface VersionsPanelProps {
  roadmapId: string
  sessionToken: string
  onClose: () => void
  onRestored: (roadmap: Roadmap) => void
  onToast: (message: string) => void
}

function actionLabel(action: string | null): string {
  switch (action) {
    case 'roadmap.created': return 'Created'
    case 'roadmap.imported': return 'Imported'
    case 'roadmap.restored': return 'Restored'
    case 'roadmap.updated': return 'Updated'
    case 'roadmap.batch_changed': return 'Updated'
    default: return action || 'Updated'
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function VersionsPanel({
  roadmapId,
  sessionToken,
  onClose,
  onRestored,
  onToast,
}: VersionsPanelProps) {
  const [versions, setVersions] = useState<RoadmapVersionSummary[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    getRoadmapVersions(roadmapId, sessionToken)
      .then((data) => {
        if (cancelled) return
        setVersions(data)
        setState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setState('error')
      })
    return () => { cancelled = true }
  }, [roadmapId, sessionToken])

  const handleRestore = async (version: RoadmapVersionSummary) => {
    const ok = window.confirm('Restore this version? Current roadmap will be replaced for all collaborators.')
    if (!ok) return

    setRestoringId(version.id)
    try {
      const restored = await restoreRoadmapVersion(roadmapId, version.id, sessionToken)
      onRestored(restored)
      onToast('Restored roadmap')
      onClose()
    } catch (err) {
      const msg = err instanceof Error && (err.message.includes('401') || err.message.includes('403'))
        ? 'Only the owner can restore versions.'
        : 'Could not restore version'
      onToast(msg)
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div className="activity-panel versions-panel">
      <div className="panel-head">
        <h3>Versions</h3>
        <button className="close-btn" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="panel-body">
        {state === 'loading' ? (
          <div className="state-msg">
            <span className="spin">
              <Icon name="spark" size={24} />
            </span>
            <p>Loading versions...</p>
          </div>
        ) : state === 'error' ? (
          <div className="state-msg offline">
            <Icon name="clock" size={24} />
            <p>Versions could not be loaded.</p>
          </div>
        ) : versions.length === 0 ? (
          <div className="state-msg">
            <Icon name="clock" size={24} />
            <p>No versions yet.</p>
          </div>
        ) : (
          <div className="version-list">
            {versions.map((version) => (
              <div key={version.id} className="version-row">
                <div className="version-main">
                  <div className="version-title">
                    <span>v{version.versionNumber}</span>
                    {actionLabel(version.action)}
                  </div>
                  <div className="version-meta">
                    {formatTime(version.createdAt)} · {version.actorName || 'System'}
                  </div>
                  <div className="version-counts">
                    {version.phaseCount} phases · {version.taskCount} tasks
                  </div>
                </div>
                <button
                  className="btn sm ghost"
                  onClick={() => handleRestore(version)}
                  disabled={restoringId === version.id}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
