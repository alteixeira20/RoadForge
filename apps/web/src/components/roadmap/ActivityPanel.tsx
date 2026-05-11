'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@/components/ui/Icon'
import { getRoadmapActivity } from '@/services/roadmap.service'
import type { ActivityLog } from '@/types/roadmap'

interface ActivityPanelProps {
  roadmapId: string
  sessionToken: string
  onClose: () => void
}

export function ActivityPanel({ roadmapId, sessionToken, onClose }: ActivityPanelProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await getRoadmapActivity(roadmapId, sessionToken)
        setLogs(data.logs)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load activity')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [roadmapId, sessionToken])

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    const hrs = Math.floor(mins / 60)
    const days = Math.floor(hrs / 24)

    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    if (hrs < 24) return `${hrs}h ago`
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString()
  }

  const getActionLabel = (action: string, metadata: Record<string, unknown> | null) => {
    switch (action) {
      case 'roadmap.created': return 'Created roadmap'
      case 'roadmap.updated': return 'Saved roadmap'
      case 'participant.joined': return `Joined as ${metadata?.role || 'contributor'}`
      case 'share_link.rotated': return `Rotated ${metadata?.role || ''} link`
      case 'share_link.revoked': return `Revoked ${metadata?.role || ''} link`
      default: return action
    }
  }

  const getDetails = (log: ActivityLog) => {
    const { action, before_json, after_json, metadata_json } = log
    if (action === 'roadmap.created' && after_json?.name) {
      return <span>&ldquo;{String(after_json.name)}&rdquo;</span>
    }
    if (action === 'roadmap.updated') {
      if (before_json?.phase_count !== undefined && after_json?.phase_count !== undefined) {
        return <span>{String(after_json.phase_count)} phases</span>
      }
      return <span className="dim">Snapshot saved</span>
    }
    if (action === 'task.completed' || action === 'task.reopened' || action === 'task.created' || action === 'task.updated') {
      return <span>{String(metadata_json?.taskId)} — {String(metadata_json?.taskTitle)}</span>
    }
    if (action === 'task.dependency.linked' || action === 'task.dependency.unlinked') {
      return <span>{String(metadata_json?.taskId)} depends on {String(metadata_json?.dependencyId)}</span>
    }
    if (action === 'task.reordered') {
      if (metadata_json?.phaseId) {
        return <span>Phase {String(metadata_json?.phaseName || metadata_json?.phaseId)}</span>
      }
      return <span>{String(metadata_json?.taskId)} — {String(metadata_json?.taskTitle)}</span>
    }
    return null
  }

  return (
    <div className="activity-panel">
      <div className="panel-head">
        <h3>Activity</h3>
        <button className="close-btn" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="panel-body">
        {loading ? (
          <div className="state-msg">
            <span className="spin">
              <Icon name="spark" size={24} />
            </span>
            <p>Loading activity...</p>
          </div>
        ) : error ? (
          <div className="state-msg error">
            <Icon name="flame" size={24} />
            <p>{error}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="state-msg">
            <Icon name="activity" size={24} />
            <p>No activity yet.</p>
          </div>
        ) : (
          <div className="activity-list">
            {logs.map((log) => (
              <div key={log.id} className="activity-row">
                <div className="row-main">
                  <span className="actor">{log.actor_name || 'System'}</span>
                  <span className="action">{getActionLabel(log.action, log.metadata_json)}</span>
                </div>
                <div className="row-meta">
                  <span className="details">{getDetails(log)}</span>
                  <span className="time">{formatTime(log.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
