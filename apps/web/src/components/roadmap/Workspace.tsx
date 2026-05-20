'use client'

import { useState, useMemo } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Toast } from '@/components/ui/Toast'
import { AppHeader } from '@/components/layout/AppHeader'
import { WorkspaceHead } from './WorkspaceHead'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { PhaseList } from './PhaseList'
import { WorkspaceModals } from './WorkspaceModals'
import { ActivityPanel } from './ActivityPanel'
import { useRoadmap } from '@/context/RoadmapContext'
import { useWorkspaceModals } from '@/hooks/useWorkspaceModals'
import { usePhaseCollapse } from '@/hooks/usePhaseCollapse'
import { usePhaseSearch } from '@/hooks/usePhaseSearch'
import { useToastState } from '@/hooks/useToastState'
import { createRoadmap, isApiConnectionError, saveToServer } from '@/services/roadmap.service'
import type { WorkspaceMode, Task, ChangeSummary } from '@/types/roadmap'

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
  const { searchQuery, setSearchQuery, filteredPhases, matchingPhaseIds } = usePhaseSearch(phases)
  const { toast, showToast } = useToastState()

  // ─── Effective State ───────────────────────────────────────────────────────

  const effectiveOpenPhases = searchQuery.trim() ? matchingPhaseIds : openPhases
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
  const [showActivity, setShowActivity] = useState(false)
  const [pendingChangeSummary, setPendingChangeSummary] = useState<ChangeSummary | null>(null)

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
        setPendingChangeSummary(null)
      } else {
        if (!sessionToken) {
          showToast('Session expired — rejoin from the invite link')
          return
        }
        const data = await saveToServer(serverRoadmapId, roadmapName, phases, sessionToken, updatedAt || undefined, pendingChangeSummary)
        setUpdatedAt(data.updated_at)
        setPendingChangeSummary(null)
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
      } else if (isApiConnectionError(err)) {
        showToast('RoadForge API is not reachable. Start the backend with make start.')
      } else {
        showToast('Save failed — check backend connection')
      }
    }
  }

  const onCheckTask = (id: string) => {
    if (readOnly) return

    const task = allTasks.find((t) => t.id === id)
    if (!task) return

    // Reopening is always allowed
    if (task.done) {
      setPhases(
        phases.map((p) => ({
          ...p,
          tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: false } : t)),
        })),
      )
      setSaved(false)
      return
    }

    // ─── Completion Guard ────────────────────────────────────────────────────

    const subtasks = allTasks.filter((st) => st.parentId === id)
    const unfinishedSubtasks = subtasks.filter((st) => !st.done)

    const depIds = task.deps || []
    const unfinishedDeps: Task[] = []
    const missingDepIds: string[] = []

    depIds.forEach((dId) => {
      const d = allTasks.find((at) => at.id === dId)
      if (!d) {
        missingDepIds.push(dId)
      } else if (!d.done) {
        unfinishedDeps.push(d)
      }
    })

    if (unfinishedSubtasks.length > 0 || unfinishedDeps.length > 0 || missingDepIds.length > 0) {
      if (missingDepIds.length > 0) {
        showToast(`Cannot complete task: missing dependency ${missingDepIds[0]}`)
        return
      }

      if (unfinishedSubtasks.length > 0 && unfinishedDeps.length > 0) {
        showToast('Complete all subtasks and dependencies first.')
        return
      }

      if (unfinishedSubtasks.length > 0) {
        showToast('Complete all subtasks first.')
        return
      }

      if (unfinishedDeps.length === 1) {
        showToast(`Complete ${unfinishedDeps[0].id} — ${unfinishedDeps[0].title} first.`)
        return
      }

      const count = unfinishedDeps.length
      const ids = unfinishedDeps.map((d) => d.id).join(', ')
      showToast(`Complete ${count} blockers first: ${ids}`)
      return
    }

    setPhases(
      phases.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: true } : t)),
      })),
    )
    setSaved(false)
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
      parentId: parentId,
    }

    setPhases(
      phases.map((p) => {
        // Find phase containing the parent
        const parentIdx = p.tasks.findIndex((t) => t.id === parentId)
        if (parentIdx === -1) return p

        const newTasks = [...p.tasks]
        // Insert after parent in flat storage
        newTasks.splice(parentIdx + 1, 0, newSubtask)
        return { ...p, tasks: newTasks }
      }),
    )

    setPendingChangeSummary({ action: 'task.created', taskId: newId, taskTitle: title, entityType: 'task', entityId: newId })
    setSaved(false)
    setExpandedTaskId(newId)
  }

  const handleAddTask = (phaseId: string) => {
    if (readOnly) return

    const newId = generateTaskId(allTasks)
    const newTask: Task = {
      id: newId,
      title: 'New task',
      done: false,
      next: false,
      est: '',
      tags: [],
      deps: [],
      desc: '',
    }

    setPhases(
      phases.map((p) => {
        if (p.id !== phaseId) return p
        return { ...p, tasks: [...p.tasks, newTask] }
      }),
    )

    setSaved(false)
    setExpandedTaskId(newId)
  }

  const handleUpdateTask = (id: string, updates: Partial<Task>) => {
    if (readOnly) return
    setPhases(
      phases.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      })),
    )
    setSaved(false)
  }

  const handleUpdatePhaseColor = (phaseId: string, color: string) => {
    if (readOnly) return

    const phase = phases.find((p) => p.id === phaseId)
    if (!phase || phase.color === color) return

    setPhases(
      phases.map((p) => (p.id === phaseId ? { ...p, color } : p)),
    )
    setPendingChangeSummary({
      action: 'phase.updated',
      phaseId,
      phaseName: phase.name,
      entityType: 'phase',
      entityId: phaseId,
      details: 'Changed phase color',
    })
    setSaved(false)
  }

  const handleLinkDependency = (taskId: string, depId: string) => {
    if (readOnly) return
    if (hasCycle(taskId, depId)) {
      showToast('Circular dependency detected')
      return
    }

    const task = allTasks.find(t => t.id === taskId)
    const depTask = allTasks.find(t => t.id === depId)

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
    setPendingChangeSummary({ action: 'task.dependency.linked', taskId: taskId, taskTitle: task?.title, dependencyId: depId, dependencyTitle: depTask?.title, entityType: 'task', entityId: taskId })
    setSaved(false)
  }

  const handleUnlinkDependency = (taskId: string, depId: string) => {
    if (readOnly) return
    const task = allTasks.find(t => t.id === taskId)
    const depTask = allTasks.find(t => t.id === depId)

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
    setPendingChangeSummary({ action: 'task.dependency.unlinked', taskId: taskId, taskTitle: task?.title, dependencyId: depId, dependencyTitle: depTask?.title, entityType: 'task', entityId: taskId })
    setSaved(false)
  }

  const handleReorderTasks = (phaseId: string, taskIds: string[]) => {
    if (readOnly) return
    setPhases(
      phases.map((p) => {
        if (p.id !== phaseId) return p
        // Reconstruct the tasks array based on the new order of top-level tasks,
        // but preserve the subtasks correctly under their parents.
        // Actually, since tasks are flat in the phase.tasks array, reordering
        // top-level tasks means we move the parent AND its following subtasks as a block.
        
        const orderedTasks: Task[] = []
        taskIds.forEach(tid => {
          const parent = p.tasks.find(t => t.id === tid)
          if (parent) {
            orderedTasks.push(parent)
            // Add all its subtasks immediately after it
            const subtasks = p.tasks.filter(t => t.parentId === tid)
            orderedTasks.push(...subtasks)
          }
        })
        
        // Add any subtasks whose parents weren't in taskIds (shouldn't happen)
        // or top-level tasks that were missed.
        const handledIds = new Set(orderedTasks.map(t => t.id))
        const remainingTasks = p.tasks.filter(t => !handledIds.has(t.id))
        
        return { ...p, tasks: [...orderedTasks, ...remainingTasks] }
      }),
    )
    setSaved(false)
  }

  const handleReorderSubtasks = (parentId: string, subtaskIds: string[]) => {
    if (readOnly) return
    const parent = allTasks.find(t => t.id === parentId)
    setPhases(
      phases.map((p) => {
        const hasParent = p.tasks.some(t => t.id === parentId)
        if (!hasParent) return p

        const otherTasks = p.tasks.filter(t => t.parentId !== parentId)
        const orderedSubtasks = subtaskIds
          .map(sid => p.tasks.find(t => t.id === sid))
          .filter((t): t is Task => !!t)
        
        // We need to re-insert the subtasks after the parent in the flat array
        const parentIdx = otherTasks.findIndex(t => t.id === parentId)
        const newTasks = [...otherTasks]
        newTasks.splice(parentIdx + 1, 0, ...orderedSubtasks)
        
        return { ...p, tasks: newTasks }
      }),
    )
    setPendingChangeSummary({ action: 'task.reordered', taskId: parentId, taskTitle: parent?.title, entityType: 'task', entityId: parentId })
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
          onOpenActivity={() => setShowActivity(true)}
          hasServerActivity={!!serverRoadmapId && !!sessionToken}
        />
        <PhaseList
          phases={filteredPhases}
          openPhases={effectiveOpenPhases}
          expandedTaskId={expandedTaskId}
          allTasks={allTasks}
          readOnly={readOnly}
          onTogglePhase={togglePhase}
          onToggleTask={onToggleTask}
          onCheckTask={onCheckTask}
          onUpdateTask={handleUpdateTask}
          onUpdatePhaseColor={handleUpdatePhaseColor}
          onAddTask={handleAddTask}
          onAddSubtask={handleAddSubtask}
          onLinkDependency={handleLinkDependency}
          onUnlinkDependency={handleUnlinkDependency}
          onReorderTasks={handleReorderTasks}
          onReorderSubtasks={handleReorderSubtasks}
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

      {showActivity && (
        <ActivityPanel
          roadmapId={serverRoadmapId}
          sessionToken={sessionToken}
          onClose={() => setShowActivity(false)}
        />
      )}
    </div>
  )
}
