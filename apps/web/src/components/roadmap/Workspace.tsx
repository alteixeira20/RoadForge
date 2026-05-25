'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { Toast } from '@/components/ui/Toast'
import { AppHeader } from '@/components/layout/AppHeader'
import { WorkspaceHead } from './WorkspaceHead'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { PhaseList } from './PhaseList'
import { WorkspaceModals } from './WorkspaceModals'
import { ActivityPanel } from './ActivityPanel'
import { TeamPanel } from './TeamPanel'
import { VersionsPanel } from './VersionsPanel'
import { useRoadmap } from '@/context/RoadmapContext'
import { useWorkspaceModals } from '@/hooks/useWorkspaceModals'
import { usePhaseCollapse } from '@/hooks/usePhaseCollapse'
import { usePhaseSearch } from '@/hooks/usePhaseSearch'
import { useToastState } from '@/hooks/useToastState'
import { useAutoSync } from '@/hooks/useAutoSync'
import { createRoadmap, getParticipants, getRoadmap, isApiConnectionError, revokeParticipant, saveToServer } from '@/services/roadmap.service'
import { normalizePhasesProgress, renumberPhases } from '@/lib/phase-progress'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import { dedupeNames, getTaskAssignees, getVisibleTaskTags, taskMatchesAssignee } from '@/lib/task-assignment'
import { buildChangeSummary, mergePendingActivityChange } from '@/lib/activity-changes'
import { generateTaskId, hasCycle as hasCycleGraph } from '@/lib/task-graph'
import type { WorkspaceMode, WorkspaceView, Task, Phase as PhaseType, ActivityChange, TaskFilter, Participant, Roadmap } from '@/types/roadmap'

interface WorkspaceProps {
  mode?: WorkspaceMode
  onCreateOwn?: () => void
}

const normalizeFilterValue = (value: string) => value.trim().toLowerCase()
const TAB_TITLE_MAX = 48
const ROADMAP_NAME_MAX = 120

function getShortRoadmapTitle(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ')
  if (!normalized) return ''

  const withoutTrailingRoadmap = normalized.replace(/\s+Roadmap$/i, '')
  const base = withoutTrailingRoadmap.length >= 8 ? withoutTrailingRoadmap : normalized
  if (base.length <= TAB_TITLE_MAX) return base

  const clipped = base.slice(0, TAB_TITLE_MAX - 3)
  const wordBoundary = clipped.lastIndexOf(' ')
  const safeClip = wordBoundary >= 24 ? clipped.slice(0, wordBoundary) : clipped
  return `${safeClip.trimEnd()}...`
}

const taskMatchesFilter = (task: Task, filter: TaskFilter, displayName: string) => {
  if (filter === 'all') return true
  if (filter === 'mine') return taskMatchesAssignee(task, displayName)
  if (filter === 'pair') return getVisibleTaskTags(task).map(normalizeFilterValue).includes('pair')
  if (filter === 'next') return task.next === true
  if (filter === 'open') return task.done === false
  if (filter === 'done') return task.done === true
  if (filter.startsWith('person:')) return taskMatchesAssignee(task, filter.slice('person:'.length))
  return true
}

export function Workspace({ mode = 'owner', onCreateOwn }: WorkspaceProps) {
  const router = useRouter()
  const {
    displayName,
    roadmapName,
    setRoadmapName,
    phases,
    setPhases,
    saved,
    setSaved,
    serverRoadmapId,
    setServerRoadmapId,
    sessionToken,
    setSessionToken,
    role,
    setRole,
    ownerDisplayName,
    setOwnerDisplayName,
    updatedAt,
    setUpdatedAt,
    accessRevokedEvent,
    clearAccessRevokedEvent,
    roadmapUpgradeNotice,
    dismissRoadmapUpgradeNotice,
  } = useRoadmap()
  const readOnly = mode === 'viewer'
  const canManageShare = role === 'owner'
  const canRenameRoadmap = !readOnly && (!serverRoadmapId || role !== 'viewer')

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>('RF-05')
  const { openPhases, togglePhase, allOpen, collapseAll, expandAll } = usePhaseCollapse(phases)
  const { searchQuery, setSearchQuery, filteredPhases } = usePhaseSearch(phases)
  const { toast, showToast } = useToastState()
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all')
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('roadmap')
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
  const [showVersions, setShowVersions] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [participantsError, setParticipantsError] = useState<string | null>(null)
  const [activityRefreshKey, setActivityRefreshKey] = useState(0)
  const [pendingActivityChanges, setPendingActivityChanges] = useState<ActivityChange[]>([])

  const allTasks = useMemo(() => phases.flatMap((p) => p.tasks), [phases])
  const totalDone = allTasks.filter((t) => t.done).length
  const nextReadyCount = allTasks.filter((t) => t.next && !t.done).length
  const canViewTeam = role === 'owner' && !!serverRoadmapId && !!sessionToken

  // ─── Effective State ───────────────────────────────────────────────────────

  useEffect(() => {
    setParticipants([])
    setParticipantsError(null)
    if (!serverRoadmapId || !sessionToken || role !== 'owner') {
      setParticipantsLoading(false)
      return
    }
    let cancelled = false
    setParticipantsLoading(true)
    getParticipants(serverRoadmapId, sessionToken)
      .then((data) => {
        if (!cancelled) setParticipants(data)
      })
      .catch(() => {
        if (!cancelled) {
          setParticipants([])
          setParticipantsError('Could not load team members.')
        }
      })
      .finally(() => {
        if (!cancelled) setParticipantsLoading(false)
      })
    return () => { cancelled = true }
  }, [serverRoadmapId, sessionToken, role])

  useEffect(() => {
    if (!canViewTeam && workspaceView === 'team') setWorkspaceView('roadmap')
  }, [canViewTeam, workspaceView])

  const assignmentNames = useMemo(() => (
    dedupeNames(allTasks.flatMap((task) => getTaskAssignees(task)))
      .sort((a, b) => a.localeCompare(b))
  ), [allTasks])

  const taskEditorAssigneeNames = useMemo(() => (
    dedupeNames([
      ...participants.filter((p) => !p.revokedAt).map((p) => p.displayName),
      ...assignmentNames,
      displayName,
    ]).sort((a, b) => a.localeCompare(b))
  ), [participants, assignmentNames, displayName])

  const peopleFilterOptions = useMemo(() => {
    return assignmentNames.map((person) => ({
      value: `person:${person}` as TaskFilter,
      label: person,
    }))
  }, [assignmentNames])

  useEffect(() => {
    if (!taskFilter.startsWith('person:')) return
    const selectedName = taskFilter.slice('person:'.length).toLowerCase()
    const stillExists = assignmentNames.some((name) => name.toLowerCase() === selectedName)
    if (!stillExists) setTaskFilter('all')
  }, [assignmentNames, taskFilter])

  const taskFilterOptions = useMemo(() => ([
    { value: 'all' as TaskFilter, label: 'All' },
    { value: 'mine' as TaskFilter, label: 'My tasks' },
    ...peopleFilterOptions,
    { value: 'pair' as TaskFilter, label: 'Pair' },
    { value: 'next' as TaskFilter, label: 'Next' },
    { value: 'open' as TaskFilter, label: 'Open' },
    { value: 'done' as TaskFilter, label: 'Done' },
  ]), [peopleFilterOptions])

  const visiblePhases = useMemo(() => {
    if (taskFilter === 'all') return filteredPhases
    return filteredPhases
      .map((phase) => ({
        ...phase,
        tasks: phase.tasks.filter((task) => taskMatchesFilter(task, taskFilter, displayName)),
      }))
      .filter((phase) => phase.tasks.length > 0)
  }, [filteredPhases, taskFilter, displayName])

  const isFiltering = searchQuery.trim().length > 0 || taskFilter !== 'all'
  const effectiveOpenPhases = isFiltering ? visiblePhases.map((phase) => phase.id) : openPhases

  useEffect(() => {
    const title = getShortRoadmapTitle(roadmapName)
    document.title = title ? `${title} · RoadForge` : 'RoadForge'
    return () => {
      document.title = 'RoadForge'
    }
  }, [roadmapName])

  // ─── Access-revoked / roadmap-deleted notifications ────────────────────────
  useEffect(() => {
    if (!accessRevokedEvent) return
    showToast(
      accessRevokedEvent === 'revoked'
        ? 'Your access was revoked.'
        : 'This roadmap was deleted.',
    )
    clearAccessRevokedEvent()
    // showToast is intentionally omitted from deps (no useCallback in useToastState).
    // clearAccessRevokedEvent is stable (useCallback with empty deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessRevokedEvent])

  const onToggleTask = (id: string) => setExpandedTaskId((prev) => (prev === id ? null : id))

  const isPhaseComplete = (phase: PhaseType) => phase.tasks.length > 0 && phase.tasks.every((t) => t.done)
  const phaseLabel = (phase: PhaseType) => `${phase.num} — ${phase.name}`
  const taskCountFor = (phaseList: PhaseType[]) => phaseList.reduce((count, phase) => count + phase.tasks.length, 0)
  const findPhaseForTask = (taskId: string, phaseList: PhaseType[] = phases) => (
    phaseList.find((phase) => phase.tasks.some((task) => task.id === taskId))
  )

  const addPendingActivityChange = (change: ActivityChange) => {
    setPendingActivityChanges((prev) => mergePendingActivityChange(prev, change))
  }

  const { isConflict, setIsOffline, setIsConflict, syncStatus } = useAutoSync({
    serverRoadmapId,
    sessionToken,
    readOnly,
    saved,
    phases,
    roadmapName,
    updatedAt,
    pendingActivityChanges,
    showActivity,
    onSyncSuccess: (newUpdatedAt) => {
      setUpdatedAt(newUpdatedAt)
      setSaved(true)
      setPendingActivityChanges([])
    },
    onActivityRefresh: () => setActivityRefreshKey((k) => k + 1),
    onToast: showToast,
  })

  const handleConfirmSave = async (password?: string) => {
    closeSave()
    const changeSummary = buildChangeSummary(pendingActivityChanges, serverRoadmapId)
    try {
      if (!serverRoadmapId) {
        // First save: no bearer token needed — create returns a new owner session.
        const { roadmap, ownerSessionToken } = await createRoadmap(
          roadmapName,
          displayName || 'Owner',
          phases,
          password,
          changeSummary,
        )
        const nextRoadmapId = roadmap.roadmap.id
        setServerRoadmapId(roadmap.roadmap.id)
        setSessionToken(ownerSessionToken)
        setRole('owner')
        setOwnerDisplayName(roadmap.ownerDisplayName)
        setUpdatedAt(roadmap.updatedAt)
        setPendingActivityChanges([])
        router.replace(`/workspace?roadmap=${encodeURIComponent(nextRoadmapId)}`)
      } else {
        if (!sessionToken) {
          showToast('Session expired — rejoin from the invite link')
          return
        }
        const data = await saveToServer(serverRoadmapId, roadmapName, phases, sessionToken, updatedAt || undefined, changeSummary)
        setUpdatedAt(data.updated_at)
        setPendingActivityChanges([])
      }
      setSaved(true)
      setIsOffline(false)
      setIsConflict(false)
      if (showActivity) setActivityRefreshKey((k) => k + 1)
      showToast('Saved · collaboration enabled')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('409')) {
        setIsConflict(true)
        showToast('The roadmap changed elsewhere. Your edits are preserved locally.')
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

  const handleRenameRoadmap = (name: string) => {
    if (!canRenameRoadmap) return false

    const nextName = name.trim()
    if (!nextName) {
      showToast('Roadmap name cannot be empty.')
      return false
    }
    if (nextName.length > ROADMAP_NAME_MAX) {
      showToast(`Roadmap name must be ${ROADMAP_NAME_MAX} characters or fewer.`)
      return false
    }
    if (nextName === roadmapName) return true

    const previousName = roadmapName
    setRoadmapName(nextName)
    addPendingActivityChange({
      action: 'roadmap.renamed',
      entity_type: 'roadmap',
      entity_id: serverRoadmapId || undefined,
      roadmapName: nextName,
      previousRoadmapName: previousName,
      nextRoadmapName: nextName,
    })
    setSaved(false)
    return true
  }

  const onCheckTask = (id: string) => {
    if (readOnly) return

    const task = allTasks.find((t) => t.id === id)
    if (!task) return

    // Reopening is always allowed
    if (task.done) {
      const affectedPhase = findPhaseForTask(id)
      const wasPhaseComplete = affectedPhase ? isPhaseComplete(affectedPhase) : false
      const nextPhases = phases.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: false } : t)),
      }))
      const nextPhase = affectedPhase ? nextPhases.find((p) => p.id === affectedPhase.id) : null
      const isNowPhaseComplete = nextPhase ? isPhaseComplete(nextPhase) : false
      setPhases(nextPhases)
      addPendingActivityChange({
        action: 'task.reopened',
        entity_type: 'task',
        entity_id: task.id,
        taskId: task.id,
        taskTitle: task.title,
        phaseId: affectedPhase?.id,
        phaseName: affectedPhase?.name,
      })
      if (affectedPhase && wasPhaseComplete && !isNowPhaseComplete) {
        addPendingActivityChange({
          action: 'phase.reopened',
          entity_type: 'phase',
          entity_id: affectedPhase.id,
          phaseId: affectedPhase.id,
          phaseName: affectedPhase.name,
          phaseNum: affectedPhase.num,
          details: phaseLabel(affectedPhase),
        })
      }
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

    const affectedPhase = findPhaseForTask(id)
    const wasPhaseComplete = affectedPhase ? isPhaseComplete(affectedPhase) : false
    const nextPhases = phases.map((p) => ({
      ...p,
      tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: true } : t)),
    }))
    const nextPhase = affectedPhase ? nextPhases.find((p) => p.id === affectedPhase.id) : null
    const isNowPhaseComplete = nextPhase ? isPhaseComplete(nextPhase) : false
    setPhases(nextPhases)
    addPendingActivityChange({
      action: 'task.completed',
      entity_type: 'task',
      entity_id: task.id,
      taskId: task.id,
      taskTitle: task.title,
      phaseId: affectedPhase?.id,
      phaseName: affectedPhase?.name,
    })
    if (affectedPhase && !wasPhaseComplete && isNowPhaseComplete) {
      addPendingActivityChange({
        action: 'phase.completed',
        entity_type: 'phase',
        entity_id: affectedPhase.id,
        phaseId: affectedPhase.id,
        phaseName: affectedPhase.name,
        phaseNum: affectedPhase.num,
        details: phaseLabel(affectedPhase),
      })
    }
    setSaved(false)
  }

  // ─── Task Mutations ──────────────────────────────────────────────────────────

  const hasCycle = (taskId: string, depId: string): boolean => hasCycleGraph(taskId, depId, allTasks)

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

    const phase = findPhaseForTask(parentId)
    addPendingActivityChange({
      action: 'task.created',
      entity_type: 'task',
      entity_id: newId,
      taskId: newId,
      taskTitle: title,
      phaseId: phase?.id,
      phaseName: phase?.name,
      parentId,
    })
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

    const phase = phases.find((p) => p.id === phaseId)
    setPhases(
      phases.map((p) => {
        if (p.id !== phaseId) return p
        return { ...p, tasks: [...p.tasks, newTask] }
      }),
    )

    addPendingActivityChange({
      action: 'task.created',
      entity_type: 'task',
      entity_id: newId,
      taskId: newId,
      taskTitle: newTask.title,
      phaseId: phase?.id,
      phaseName: phase?.name,
    })
    setSaved(false)
    setExpandedTaskId(newId)
  }

  const handleUpdateTask = (id: string, updates: Partial<Task>) => {
    if (readOnly) return
    const task = allTasks.find((t) => t.id === id)
    const phase = findPhaseForTask(id)
    setPhases(
      phases.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      })),
    )
    if (task) {
      addPendingActivityChange({
        action: 'task.updated',
        entity_type: 'task',
        entity_id: id,
        taskId: id,
        taskTitle: updates.title ?? task.title,
        phaseId: phase?.id,
        phaseName: phase?.name,
      })
    }
    setSaved(false)
  }

  const handleUpdatePhaseColor = (phaseId: string, color: string) => {
    if (readOnly) return

    const phase = phases.find((p) => p.id === phaseId)
    if (!phase || phase.color === color) return

    setPhases(
      phases.map((p) => (p.id === phaseId ? { ...p, color } : p)),
    )
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
    const phase = findPhaseForTask(taskId)
    addPendingActivityChange({
      action: 'task.dependency.linked',
      entity_type: 'task',
      entity_id: taskId,
      taskId,
      taskTitle: task?.title,
      dependencyId: depId,
      dependencyTitle: depTask?.title,
      phaseId: phase?.id,
      phaseName: phase?.name,
    })
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
    const phase = findPhaseForTask(taskId)
    addPendingActivityChange({
      action: 'task.dependency.unlinked',
      entity_type: 'task',
      entity_id: taskId,
      taskId,
      taskTitle: task?.title,
      dependencyId: depId,
      dependencyTitle: depTask?.title,
      phaseId: phase?.id,
      phaseName: phase?.name,
    })
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
    const phase = phases.find((p) => p.id === phaseId)
    addPendingActivityChange({
      action: 'task.reordered',
      entity_type: 'phase',
      entity_id: phaseId,
      phaseId,
      phaseName: phase?.name,
    })
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
    const phase = findPhaseForTask(parentId)
    addPendingActivityChange({
      action: 'task.reordered',
      entity_type: 'task',
      entity_id: parentId,
      taskId: parentId,
      taskTitle: parent?.title,
      phaseId: phase?.id,
      phaseName: phase?.name,
    })
    setSaved(false)
  }

  const handleReorderPhases = (phaseIds: string[]) => {
    if (readOnly) return
    const reordered = renumberPhases(
      phaseIds
        .map((id) => phases.find((p) => p.id === id))
        .filter((p): p is PhaseType => !!p),
    )
    setPhases(reordered)
    addPendingActivityChange({
      action: 'roadmap.phases_reordered',
      entity_type: 'roadmap',
      entity_id: serverRoadmapId || undefined,
    })
    setSaved(false)
  }

  const handleRoadmapImported = (importedName: string | undefined, importedPhases: PhaseType[]) => {
    setPendingActivityChanges([{
      action: 'roadmap.imported',
      entity_type: 'roadmap',
      roadmapName: importedName,
      phase_count: importedPhases.length,
      task_count: taskCountFor(importedPhases),
    }])
  }

  const handleRoadmapRestored = (restored: Roadmap) => {
    const upgraded = upgradeRoadmapSnapshot({
      roadmapName: restored.roadmap.name,
      phases: restored.phases,
    })
    setRoadmapName(upgraded.roadmapName || restored.roadmap.name)
    setPhases(upgraded.phases)
    setOwnerDisplayName(restored.ownerDisplayName)
    setUpdatedAt(restored.updatedAt)
    setSaved(!upgraded.changed)
    setIsOffline(false)
    setIsConflict(false)
    if (showActivity) setActivityRefreshKey((k) => k + 1)
  }

  const handleReloadServerVersion = async () => {
    if (!serverRoadmapId || !sessionToken) return
    if (!window.confirm('Reload the latest server version? Your unsynced local edits will be discarded.')) return
    try {
      const loaded = await getRoadmap(serverRoadmapId, sessionToken)
      const upgraded = upgradeRoadmapSnapshot({
        roadmapName: loaded.roadmap.name,
        phases: loaded.phases,
      })
      setRoadmapName(upgraded.roadmapName || loaded.roadmap.name)
      setPhases(normalizePhasesProgress(upgraded.phases))
      setOwnerDisplayName(loaded.ownerDisplayName)
      setUpdatedAt(loaded.updatedAt)
      setPendingActivityChanges([])
      setSaved(!upgraded.changed)
      setIsConflict(false)
      setIsOffline(false)
      showToast('Reloaded server version.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (isApiConnectionError(err)) {
        showToast('Could not reach the server — try again later.')
      } else if (msg.includes('401') || msg.includes('403')) {
        showToast('Session expired — rejoin from the invite link.')
      } else {
        showToast('Could not reload server version.')
      }
    }
  }

  const handleRevokeTeamParticipant = async (participant: Participant) => {
    if (!serverRoadmapId || !sessionToken) return
    if (participant.isCurrentParticipant) {
      showToast('You cannot revoke your current owner session.')
      return
    }
    if (!window.confirm(`Revoke access for ${participant.displayName}?`)) return

    try {
      await revokeParticipant(serverRoadmapId, participant.id, sessionToken)
      showToast('Participant revoked')
      setParticipants((current) => current.map((item) => (
        item.id === participant.id
          ? { ...item, revokedAt: new Date().toISOString() }
          : item
      )))
      setParticipantsError(null)
      try {
        setParticipants(await getParticipants(serverRoadmapId, sessionToken))
      } catch {
        setParticipantsError('Could not refresh team members.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('401') || msg.includes('403')) showToast('Only the owner can manage participants.')
      else if (msg.includes('400')) showToast('You cannot revoke your current owner session.')
      else showToast('Could not revoke participant')
    }
  }

  return (
    <div className="app-shell">
      <AppHeader
        roadmapName={roadmapName}
        displayName={displayName || 'You'}
        syncStatus={syncStatus}
        readOnly={readOnly}
        canManageShare={canManageShare}
        onSave={openSave}
        onShare={openShare}
        onIO={openIO}
        onCreateOwn={onCreateOwn}
        onReloadServerVersion={handleReloadServerVersion}
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

      {isConflict && !readOnly && (
        <div className="conflict-banner">
          <span className="pill">
            <Icon name="shield" size={11} /> Conflict
          </span>
          <span className="msg">
            The roadmap changed elsewhere. Your edits are preserved locally.
          </span>
          <span className="spacer" />
          <button className="btn sm" onClick={handleReloadServerVersion}>
            <Icon name="cloud" size={13} /> Reload server version
          </button>
        </div>
      )}

      <div className="workspace">
        {roadmapUpgradeNotice && (
          <div className="upgrade-notice" role="status">
            <div className="upgrade-notice-icon">
              <Icon name="shield" size={16} />
            </div>
            <div className="upgrade-notice-copy">
              <strong>Roadmap updated</strong>
              <span>RoadForge updated this roadmap so it works with the latest version. No action is required.</span>
            </div>
            <div className="upgrade-notice-actions">
              <button type="button" className="iconbtn" aria-label="Dismiss schema upgrade notice" onClick={dismissRoadmapUpgradeNotice}>
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>
        )}
        <WorkspaceHead
          roadmapName={roadmapName}
          totalDone={totalDone}
          totalTasks={allTasks.length}
          phaseCount={phases.length}
          saved={saved}
          nextReadyCount={nextReadyCount}
          canRename={canRenameRoadmap}
          maxNameLength={ROADMAP_NAME_MAX}
          onRename={handleRenameRoadmap}
        />
        <WorkspaceToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          taskFilter={taskFilter}
          taskFilterOptions={taskFilterOptions}
          onTaskFilterChange={setTaskFilter}
          workspaceView={workspaceView}
          onWorkspaceViewChange={(view) => setWorkspaceView(view === 'team' && !canViewTeam ? 'roadmap' : view)}
          allOpen={allOpen}
          onCollapseAll={collapseAll}
          onExpandAll={expandAll}
          onOpenActivity={() => setShowActivity(true)}
          onOpenVersions={() => setShowVersions(true)}
          hasServerActivity={!!serverRoadmapId && !!sessionToken}
          canViewTeam={canViewTeam}
          canViewVersions={role === 'owner' && !!serverRoadmapId && !!sessionToken}
        />
        {workspaceView === 'team' && canViewTeam ? (
          <TeamPanel
            participants={participants}
            loading={participantsLoading}
            error={participantsError}
            canManageParticipants={canManageShare}
            onInvite={openShare}
            onRevokeParticipant={handleRevokeTeamParticipant}
            onBack={() => setWorkspaceView('roadmap')}
          />
        ) : (
          <PhaseList
            phases={visiblePhases}
            openPhases={effectiveOpenPhases}
            expandedTaskId={expandedTaskId}
            allTasks={allTasks}
            readOnly={readOnly}
            isFiltering={isFiltering}
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
            onReorderPhases={handleReorderPhases}
            hasCycle={hasCycle}
            assignmentNames={taskEditorAssigneeNames}
          />
        )}
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
        onRoadmapImported={handleRoadmapImported}
      />

      {toast && <Toast message={toast} />}

      {showActivity && (
        <ActivityPanel
          roadmapId={serverRoadmapId}
          sessionToken={sessionToken}
          onClose={() => setShowActivity(false)}
          refreshKey={activityRefreshKey}
        />
      )}

      {showVersions && serverRoadmapId && sessionToken && (
        <VersionsPanel
          roadmapId={serverRoadmapId}
          sessionToken={sessionToken}
          onClose={() => setShowVersions(false)}
          onRestored={handleRoadmapRestored}
          onToast={showToast}
        />
      )}
    </div>
  )
}
