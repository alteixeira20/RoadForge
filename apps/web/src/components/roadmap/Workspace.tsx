'use client'

import { useState, useMemo } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Toast } from '@/components/ui/Toast'
import { AppHeader } from '@/components/layout/AppHeader'
import { WorkspaceHead } from './WorkspaceHead'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { PhaseList } from './PhaseList'
import { WorkspaceModals } from './WorkspaceModals'
import { useRoadmap } from '@/context/RoadmapContext'
import { useWorkspaceModals } from '@/hooks/useWorkspaceModals'
import { usePhaseCollapse } from '@/hooks/usePhaseCollapse'
import { usePhaseSearch } from '@/hooks/usePhaseSearch'
import { useToastState } from '@/hooks/useToastState'
import { createRoadmap, saveToServer } from '@/services/roadmap.service'
import type { WorkspaceMode, Task } from '@/types/roadmap'

interface WorkspaceProps {
  mode?: WorkspaceMode
  onCreateOwn?: () => void
}

export function Workspace({ mode = 'owner', onCreateOwn }: WorkspaceProps) {
  const {
    displayName,
    roadmapName,
    phases,
    setPhases,
    saved,
    setSaved,
    serverRoadmapId,
    setServerRoadmapId,
    sessionToken,
    setSessionToken,
    setRole,
    ownerDisplayName,
    setOwnerDisplayName,
    updatedAt,
    setUpdatedAt,
  } = useRoadmap()
  const readOnly = mode === 'viewer'

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>('RF-05')
  const { openPhases, togglePhase, allOpen, collapseAll, expandAll } = usePhaseCollapse(phases)
  const { searchQuery, setSearchQuery, filteredPhases } = usePhaseSearch(phases)
  const { toast, showToast } = useToastState()
  const {
    showSave,
    showShare,
    showIO,
    openSave,
    openShare,
    openIO,
    closeSave,
    closeShare,
    closeIO,
  } = useWorkspaceModals()

  const allTasks = useMemo(() => phases.flatMap((p) => p.tasks), [phases])
  const totalDone = allTasks.filter((t) => t.done).length
  const nextReadyCount = allTasks.filter((t) => t.next && !t.done).length

  const onToggleTask = (id: string) => setExpandedTaskId((prev) => (prev === id ? null : id))

  const handleConfirmSave = async (password?: string) => {
    closeSave()
    try {
      if (!serverRoadmapId) {
        // First save: no bearer token needed — create returns a new owner session.
        const { roadmap, ownerSessionToken } = await createRoadmap(
          roadmapName,
          displayName || 'Owner',
          phases,
          password,
        )
        setServerRoadmapId(roadmap.roadmap.id)
        setSessionToken(ownerSessionToken)
        setRole('owner')
        setOwnerDisplayName(roadmap.ownerDisplayName)
        setUpdatedAt(roadmap.updatedAt)
      } else {
        if (!sessionToken) {
          showToast('Session expired — rejoin from the invite link')
          return
        }
        const data = await saveToServer(serverRoadmapId, roadmapName, phases, sessionToken, updatedAt || undefined)
        setUpdatedAt(data.updated_at)
      }
      setSaved(true)
      showToast('Saved · collaboration enabled')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('409')) {
        showToast('This roadmap changed elsewhere — reload before saving')
      } else if (msg.includes('401')) {
        showToast('Session expired — rejoin from the invite link')
      } else if (msg.includes('403')) {
        showToast('You do not have permission for this action')
      } else {
        showToast('Save failed — check backend connection')
      }
    }
  }

  const onCheckTask = (id: string) => {
    if (readOnly) return
    setPhases(
      phases.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      })),
    )
  }

  // ─── Task Mutations ──────────────────────────────────────────────────────────

  const generateTaskId = (allTasks: Task[]): string => {
    const rfIds = allTasks
      .map((t) => t.id)
      .filter((id) => id.startsWith('RF-'))
      .map((id) => parseInt(id.replace('RF-', ''), 10))
      .filter((n) => !isNaN(n))

    if (rfIds.length === 0) return `TASK-${Date.now().toString().slice(-6)}`

    const nextId = Math.max(...rfIds) + 1
    return `RF-${nextId.toString().padStart(2, '0')}`
  }

  const hasCycle = (taskId: string, depId: string): boolean => {
    const taskMap = new Map(allTasks.map((t) => [t.id, t]))
    const visited = new Set<string>()

    const isReachable = (startId: string, targetId: string): boolean => {
      if (startId === targetId) return true
      if (visited.has(startId)) return false
      visited.add(startId)

      const task = taskMap.get(startId)
      if (!task?.deps) return false

      for (const d of task.deps) {
        if (isReachable(d, targetId)) return true
      }
      return false
    }

    return isReachable(depId, taskId)
  }

  const handleAddSubtask = (parentId: string, title: string) => {
    if (readOnly) return
    const parent = allTasks.find((t) => t.id === parentId)
    if (!parent) return

    const newId = generateTaskId(allTasks)
    const newSubtask: Task = {
      id: newId,
      title,
      done: false,
      next: false,
      tags: ['subtask'],
      deps: [],
      desc: `Subtask of ${parent.id} — ${parent.title}`,
    }

    setPhases(
      phases.map((p) => {
        const parentIdx = p.tasks.findIndex((t) => t.id === parentId)
        if (parentIdx === -1) return p

        const newTasks = [...p.tasks]
        newTasks.splice(parentIdx + 1, 0, newSubtask)
        return { ...p, tasks: newTasks }
      }),
    )

    setSaved(false)
    setExpandedTaskId(newId)
  }

  const handleLinkDependency = (taskId: string, depId: string) => {
    if (readOnly) return
    if (hasCycle(taskId, depId)) {
      showToast('Circular dependency detected')
      return
    }

    setPhases(
      phases.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => {
          if (t.id !== taskId) return t
          const deps = Array.from(new Set([...(t.deps || []), depId]))
          return { ...t, deps }
        }),
      })),
    )
    setSaved(false)
  }

  const handleUnlinkDependency = (taskId: string, depId: string) => {
    if (readOnly) return
    setPhases(
      phases.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => {
          if (t.id !== taskId) return t
          const deps = (t.deps || []).filter((id) => id !== depId)
          return { ...t, deps }
        }),
      })),
    )
    setSaved(false)
  }

  return (
    <div className="app-shell">
      <AppHeader
        roadmapName={roadmapName}
        displayName={displayName || 'You'}
        saved={saved}
        readOnly={readOnly}
        onSave={openSave}
        onShare={() => (saved ? openShare() : openSave())}
        onIO={openIO}
        onCreateOwn={onCreateOwn}
      />

      {readOnly && (
        <div className="readonly-banner">
          <span className="pill">
            <Icon name="circle" size={11} /> Viewer
          </span>
          <span className="who">
            You&apos;re viewing <b>{roadmapName}</b> as a read-only guest.
            {ownerDisplayName && <> Owner: <b>{ownerDisplayName}</b>.</>}
          </span>
          <span className="spacer" />
          <button className="btn sm" onClick={onCreateOwn}>
            <Icon name="plus" size={13} /> Create your own roadmap
          </button>
        </div>
      )}

      <div className="workspace">
        <WorkspaceHead
          roadmapName={roadmapName}
          totalDone={totalDone}
          totalTasks={allTasks.length}
          phaseCount={phases.length}
          saved={saved}
          nextReadyCount={nextReadyCount}
        />
        <WorkspaceToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          allOpen={allOpen}
          onCollapseAll={collapseAll}
          onExpandAll={expandAll}
        />
        <PhaseList
          phases={filteredPhases}
          openPhases={openPhases}
          expandedTaskId={expandedTaskId}
          allTasks={allTasks}
          readOnly={readOnly}
          onTogglePhase={togglePhase}
          onToggleTask={onToggleTask}
          onCheckTask={onCheckTask}
          onAddSubtask={handleAddSubtask}
          onLinkDependency={handleLinkDependency}
          onUnlinkDependency={handleUnlinkDependency}
          hasCycle={hasCycle}
        />
      </div>

      <WorkspaceModals
        showSave={showSave}
        showShare={showShare}
        showIO={showIO}
        onCloseSave={closeSave}
        onCloseShare={closeShare}
        onCloseIO={closeIO}
        onConfirmSave={handleConfirmSave}
        onToast={showToast}
      />

      {toast && <Toast message={toast} />}
    </div>
  )
}
