'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import type { Phase, RoadmapConflictMetadata, Task } from '@/types/roadmap'

interface ConflictReviewPanelProps {
  open: boolean
  conflict: RoadmapConflictMetadata | null
  localName: string
  localPhases: Phase[]
  keepLocalLoading: boolean
  onClose: () => void
  onUseServerVersion: () => void
  onKeepLocalVersion: () => Promise<string | null> | string | null | void
}

interface ConflictDiff {
  id: string
  label: string
  local: string
  server: string
}

function taskCount(phases: Phase[]): number {
  return phases.reduce((count, phase) => count + phase.tasks.length, 0)
}

function taskSummary(task: Task): string {
  const assignees = task.assignees?.length ? task.assignees.join(', ') : 'none'
  const tags = task.tags?.length ? task.tags.join(', ') : 'none'
  return `${task.title} - ${task.done ? 'done' : 'open'} - ${task.next ? 'next' : 'not next'} - ${assignees} - ${tags}`
}

function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

function appendTaskDiffs(diffs: ConflictDiff[], localPhase: Phase, serverPhase: Phase): void {
  const localTasks = indexById(localPhase.tasks)
  const serverTasks = indexById(serverPhase.tasks)
  const taskIds = new Set([...localTasks.keys(), ...serverTasks.keys()])

  for (const taskId of taskIds) {
    const localTask = localTasks.get(taskId)
    const serverTask = serverTasks.get(taskId)
    if (!localTask || !serverTask) {
      diffs.push({
        id: `task-presence-${taskId}`,
        label: `Task ${taskId}`,
        local: localTask ? taskSummary(localTask) : 'Missing locally',
        server: serverTask ? taskSummary(serverTask) : 'Missing on server',
      })
      continue
    }
    const localIndex = localPhase.tasks.findIndex((task) => task.id === taskId)
    const serverIndex = serverPhase.tasks.findIndex((task) => task.id === taskId)
    if (taskSummary(localTask) !== taskSummary(serverTask) || localIndex !== serverIndex) {
      diffs.push({
        id: `task-fields-${taskId}`,
        label: `Task ${taskId}`,
        local: `${localIndex + 1}. ${taskSummary(localTask)}`,
        server: `${serverIndex + 1}. ${taskSummary(serverTask)}`,
      })
    }
  }
}

function buildDiffs(localName: string, localPhases: Phase[], serverName: string, serverPhases: Phase[]): ConflictDiff[] {
  const diffs: ConflictDiff[] = []
  if (localName !== serverName) {
    diffs.push({ id: 'roadmap-name', label: 'Roadmap name', local: localName, server: serverName })
  }
  if (localPhases.length !== serverPhases.length) {
    diffs.push({
      id: 'phase-count',
      label: 'Phase count',
      local: String(localPhases.length),
      server: String(serverPhases.length),
    })
  }
  if (taskCount(localPhases) !== taskCount(serverPhases)) {
    diffs.push({
      id: 'task-count',
      label: 'Task count',
      local: String(taskCount(localPhases)),
      server: String(taskCount(serverPhases)),
    })
  }

  const serverPhasesById = indexById(serverPhases)
  for (const [index, localPhase] of localPhases.entries()) {
    const serverPhase = serverPhasesById.get(localPhase.id)
    if (!serverPhase) {
      diffs.push({
        id: `phase-missing-${localPhase.id}`,
        label: `Phase ${localPhase.id}`,
        local: `${index + 1}. ${localPhase.name}`,
        server: 'Missing on server',
      })
      continue
    }
    const serverIndex = serverPhases.findIndex((phase) => phase.id === localPhase.id)
    if (localPhase.name !== serverPhase.name || index !== serverIndex) {
      diffs.push({
        id: `phase-fields-${localPhase.id}`,
        label: `Phase ${localPhase.id}`,
        local: `${index + 1}. ${localPhase.name}`,
        server: `${serverIndex + 1}. ${serverPhase.name}`,
      })
    }
    appendTaskDiffs(diffs, localPhase, serverPhase)
  }

  for (const serverPhase of serverPhases) {
    if (!localPhases.some((phase) => phase.id === serverPhase.id)) {
      diffs.push({
        id: `phase-server-only-${serverPhase.id}`,
        label: `Phase ${serverPhase.id}`,
        local: 'Missing locally',
        server: serverPhase.name,
      })
    }
  }
  return diffs
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function ConflictReviewPanel({
  open,
  conflict,
  localName,
  localPhases,
  keepLocalLoading,
  onClose,
  onUseServerVersion,
  onKeepLocalVersion,
}: ConflictReviewPanelProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const serverName = conflict?.server.name ?? ''
  const serverPhases = conflict?.server.phases ?? []
  const diffs = conflict ? buildDiffs(localName, localPhases, serverName, serverPhases) : []

  useEffect(() => {
    if (open) setErrorMessage(null)
  }, [open])

  const closePanel = () => {
    setErrorMessage(null)
    onClose()
  }

  const keepLocalVersion = async () => {
    const message = await onKeepLocalVersion()
    setErrorMessage(message ?? null)
  }

  const footer = (
    <>
      <button className="btn sm ghost" onClick={closePanel} disabled={keepLocalLoading}>
        Keep editing locally
      </button>
      <span className="spacer" />
      <button className="btn sm" onClick={onUseServerVersion} disabled={keepLocalLoading}>
        <Icon name="cloud" size={13} /> Use server version
      </button>
      <button className="btn sm primary" onClick={keepLocalVersion} disabled={keepLocalLoading || !conflict}>
        {keepLocalLoading ? 'Saving...' : 'Keep my local version'}
      </button>
    </>
  )

  return (
    <Modal
      open={open && !!conflict}
      onClose={() => {
        if (!keepLocalLoading) closePanel()
      }}
      icon={{ name: 'shield', plain: true }}
      title="Review conflict"
      sub="The server changed before your local edits were saved."
      footer={footer}
      width={720}
    >
      {conflict && (
        <div className="conflict-review">
          <div className="note-line warning">
            <Icon name="shield" size={15} />
            <span>Your local edits are still in this browser. Choose an explicit resolution before Anvilary overwrites anything.</span>
          </div>
          {errorMessage && (
            <div className="note-line warning" role="alert">
              <Icon name="circle" size={15} />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="conflict-review-meta">
            <span>Server updated: <b>{formatTimestamp(conflict.server_updated_at)}</b></span>
            <span>Local base: <b>{formatTimestamp(conflict.client_last_updated_at)}</b></span>
          </div>

          <div className="conflict-review-grid">
            <div>
              <span className="conflict-review-label">Local unsynced</span>
              <strong>{localName}</strong>
              <span>{localPhases.length} phases - {taskCount(localPhases)} tasks</span>
            </div>
            <div>
              <span className="conflict-review-label">Server latest</span>
              <strong>{serverName}</strong>
              <span>{serverPhases.length} phases - {taskCount(serverPhases)} tasks</span>
            </div>
          </div>

          <div className="conflict-review-list" aria-label="Conflict differences">
            {diffs.length === 0 ? (
              <p className="conflict-review-empty">No phase or task differences were detected in the available snapshot metadata.</p>
            ) : (
              diffs.slice(0, 30).map((diff) => (
                <div className="conflict-review-row" key={diff.id}>
                  <strong>{diff.label}</strong>
                  <div><span>Local</span><p>{diff.local}</p></div>
                  <div><span>Server</span><p>{diff.server}</p></div>
                </div>
              ))
            )}
            {diffs.length > 30 && (
              <p className="conflict-review-empty">Showing the first 30 differences. Resolve explicitly or reload to inspect the server snapshot.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
