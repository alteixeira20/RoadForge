'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AppHeader } from '@/components/layout/AppHeader'
import { WorkspaceHead } from './WorkspaceHead'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { PhaseList } from './PhaseList'
import { WorkspaceBanners, WorkspaceUpgradeNotice } from './WorkspaceBanners'
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
import { useWorkspaceParticipants } from '@/hooks/useWorkspaceParticipants'
import { useTaskMutations } from '@/hooks/useTaskMutations'
import { createRoadmap, getRoadmap, saveToServer } from '@/services/roadmap-crud.service'
import { isApiConnectionError } from '@/services/roadmap-http'
import { revokeParticipant } from '@/services/roadmap-sharing.service'
import { normalizePhasesProgress, renumberPhases } from '@/lib/phase-progress'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import { dedupeNames, getTaskAssignees, getVisibleTaskTags, taskMatchesAssignee } from '@/lib/task-assignment'
import { buildChangeSummary, mergePendingActivityChange } from '@/lib/activity-changes'
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
  const {
    participants,
    participantsLoading,
    participantsError,
    setParticipants,
    setParticipantsError,
    refreshParticipants,
  } = useWorkspaceParticipants({ serverRoadmapId, sessionToken, role })
  const [activityRefreshKey, setActivityRefreshKey] = useState(0)
  const [pendingActivityChanges, setPendingActivityChanges] = useState<ActivityChange[]>([])
  const [confirmReload, setConfirmReload] = useState(false)
  const [pendingRevokeParticipant, setPendingRevokeParticipant] = useState<Participant | null>(null)
  const [revokeLoading, setRevokeLoading] = useState(false)

  const allTasks = useMemo(() => phases.flatMap((p) => p.tasks), [phases])
  const totalDone = allTasks.filter((t) => t.done).length
  const nextReadyCount = allTasks.filter((t) => t.next && !t.done).length
  const canViewTeam = role === 'owner' && !!serverRoadmapId && !!sessionToken

  // ─── Effective State ───────────────────────────────────────────────────────

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
  }, [accessRevokedEvent, showToast, clearAccessRevokedEvent])

  const onToggleTask = (id: string) => setExpandedTaskId((prev) => (prev === id ? null : id))

  const taskCountFor = (phaseList: PhaseType[]) => phaseList.reduce((count, phase) => count + phase.tasks.length, 0)

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

  const {
    hasCycle,
    onCheckTask,
    handleAddTask,
    handleAddSubtask,
    handleUpdateTask,
    handleLinkDependency,
    handleUnlinkDependency,
    handleReorderTasks,
    handleReorderSubtasks,
  } = useTaskMutations({
    phases,
    setPhases,
    setSaved,
    addActivity: addPendingActivityChange,
    showToast,
    setExpandedTaskId,
    readOnly,
  })

  const handleUpdatePhaseColor = (phaseId: string, color: string) => {
    if (readOnly) return

    const phase = phases.find((p) => p.id === phaseId)
    if (!phase || phase.color === color) return

    setPhases(
      phases.map((p) => (p.id === phaseId ? { ...p, color } : p)),
    )
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

  const handleReloadServerVersion = () => {
    if (!serverRoadmapId || !sessionToken) return
    setConfirmReload(true)
  }

  const handleReloadConfirm = async () => {
    if (!serverRoadmapId || !sessionToken) return
    setConfirmReload(false)
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
    setPendingRevokeParticipant(participant)
  }

  const handleRevokeConfirm = async () => {
    if (!pendingRevokeParticipant || !serverRoadmapId || !sessionToken) return
    const participant = pendingRevokeParticipant
    setRevokeLoading(true)
    try {
      await revokeParticipant(serverRoadmapId, participant.id, sessionToken)
      showToast('Participant revoked')
      setParticipants((current) => current.map((item) => (
        item.id === participant.id
          ? { ...item, revokedAt: new Date().toISOString() }
          : item
      )))
      setParticipantsError(null)
      setPendingRevokeParticipant(null)
      await refreshParticipants()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('401') || msg.includes('403')) showToast('Only the owner can manage participants.')
      else if (msg.includes('400')) showToast('You cannot revoke your current owner session.')
      else showToast('Could not revoke participant')
      setPendingRevokeParticipant(null)
    } finally {
      setRevokeLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <AppHeader
        roadmapName={roadmapName}
        syncStatus={syncStatus}
        readOnly={readOnly}
        canManageShare={canManageShare}
        onSave={openSave}
        onShare={openShare}
        onIO={openIO}
        onCreateOwn={onCreateOwn}
        onReloadServerVersion={handleReloadServerVersion}
      />

      <WorkspaceBanners
        readOnly={readOnly}
        roadmapName={roadmapName}
        ownerDisplayName={ownerDisplayName}
        isConflict={isConflict}
        onCreateOwn={onCreateOwn}
        onReloadServerVersion={handleReloadServerVersion}
      />

      <div className="workspace">
        <WorkspaceUpgradeNotice
          roadmapUpgradeNotice={roadmapUpgradeNotice}
          onDismissUpgradeNotice={dismissRoadmapUpgradeNotice}
        />
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
            onToast={showToast}
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

      <ConfirmDialog
        open={confirmReload}
        title="Reload server version"
        message="Reload the latest server version? Your unsynced local edits will be discarded."
        confirmLabel="Reload"
        tone="danger"
        onConfirm={handleReloadConfirm}
        onClose={() => setConfirmReload(false)}
      />

      <ConfirmDialog
        open={pendingRevokeParticipant !== null}
        title="Revoke participant"
        message={`Revoke access for ${pendingRevokeParticipant?.displayName ?? ''}?`}
        confirmLabel="Revoke participant"
        tone="danger"
        loading={revokeLoading}
        onConfirm={handleRevokeConfirm}
        onClose={() => setPendingRevokeParticipant(null)}
      />

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
