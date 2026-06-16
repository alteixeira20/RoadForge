'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ToastViewport } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AppHeader } from '@/components/layout/AppHeader'
import { WorkspaceHead } from './WorkspaceHead'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { PhaseList } from './PhaseList'
import { WorkspaceBanners, WorkspaceUpgradeNotice } from './WorkspaceBanners'
import { WorkspaceModals } from './WorkspaceModals'
import { ConflictReviewPanel } from './ConflictReviewPanel'
import { ActivityPanel } from './ActivityPanel'
import { TeamPanel } from './TeamPanel'
import { VersionsPanel } from './VersionsPanel'
import { useRoadmap } from '@/context/RoadmapContext'
import { useWorkspaceModals } from '@/hooks/useWorkspaceModals'
import { useWorkspaceViewModel } from '@/hooks/useWorkspaceViewModel'
import { useToastState } from '@/hooks/useToastState'
import { useSaveFlow } from '@/hooks/useSaveFlow'
import { useWorkspaceParticipants } from '@/hooks/useWorkspaceParticipants'
import { createTaskMutations } from '@/hooks/useTaskMutations'
import { useTaskDonePatch } from '@/hooks/useTaskDonePatch'
import { revokeParticipant } from '@/services/roadmap-sharing.service'
import { renumberPhases } from '@/lib/phase-progress'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import { storage } from '@/lib/storage'
import type { WorkspaceMode, Phase as PhaseType, Participant, Roadmap, RoadmapConflictMetadata } from '@/types/roadmap'

interface WorkspaceProps {
  mode?: WorkspaceMode
  onCreateOwn?: () => void
}

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

export function Workspace({ mode = 'owner', onCreateOwn }: WorkspaceProps) {
  const router = useRouter()
  const {
    displayName,
    roadmapName,
    setRoadmapName,
    phases,
    setPhases,
    tagRegistry,
    saved,
    setSaved,
    serverRoadmapId,
    setServerRoadmapId,
    sessionToken,
    setSessionToken,
    participantId,
    setParticipantId,
    role,
    setRole,
    ownerDisplayName,
    setOwnerDisplayName,
    updatedAt,
    setUpdatedAt,
    activeRoadmapId,
    accessRevokedEvent,
    clearAccessRevokedEvent,
    sessionExpiredRoadmapId,
    clearSessionExpiredNotice,
    roadmapUpgradeNotice,
    dismissRoadmapUpgradeNotice,
  } = useRoadmap()
  const readOnly = mode === 'viewer' || role === 'viewer'
  const canManageShare = role === 'owner'
  const canRenameRoadmap = !readOnly

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(() => {
    if (!activeRoadmapId) return null
    return storage.getRoadmapUiState(activeRoadmapId)?.expandedTaskId ?? null
  })
  const prevActiveRoadmapIdRef = useRef(activeRoadmapId)
  // Tracks which roadmap the current expandedTaskId belongs to.
  // Prevents writing previous-roadmap expandedTaskId into the new roadmap's UI cache
  // during the render where activeRoadmapId changes but expandedTaskId hasn't updated yet.
  const expandedTaskOwnerRef = useRef(activeRoadmapId)
  const { toasts, showToast, dismissToast } = useToastState()
  const {
    showSave,
    showShare,
    showIO,
    showTagRegistry,
    openSave,
    openShare,
    openIO,
    openTagRegistry,
    closeSave,
    closeShare,
    closeIO,
    closeTagRegistry,
  } = useWorkspaceModals()
  const [showActivity, setShowActivity] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const taskDoneSuccessRef = useRef<() => void>(() => {})
  const taskDoneConflictRef = useRef<(metadata: RoadmapConflictMetadata | null) => void>(() => {})
  const taskDoneSessionExpiredRef = useRef<() => void>(() => {})
  const {
    participants,
    participantsLoading,
    participantsError,
    setParticipants,
    setParticipantsError,
    refreshParticipants,
  } = useWorkspaceParticipants({ serverRoadmapId, sessionToken, role })
  const [pendingRevokeParticipant, setPendingRevokeParticipant] = useState<Participant | null>(null)
  const [revokeLoading, setRevokeLoading] = useState(false)

  // ─── Effective State ───────────────────────────────────────────────────────
  const {
    allTasks,
    totalDone,
    nextReadyCount,
    canViewTeam,
    filterState,
    setFilterField,
    clearFilters,
    assignmentNames,
    tagIds,
    tagLabels,
    phaseOptions,
    workspaceView,
    setWorkspaceView,
    visiblePhases,
    isFiltering,
    effectiveOpenPhases,
    togglePhase,
    allOpen,
    collapseAll,
    expandAll,
    taskEditorAssigneeNames,
  } = useWorkspaceViewModel({
    phases,
    tagRegistry,
    participants,
    displayName,
    participantId,
    role,
    serverRoadmapId,
    sessionToken,
    activeRoadmapId,
  })

  // Combined effect: handles both roadmap switches and same-roadmap task-list changes.
  // Merging the two concerns into one effect prevents a race where the re-init
  // schedules B's saved task and the validate effect, running in the same effect
  // pass with A's stale expandedTaskId, schedules setExpandedTaskId(null) and wins.
  useEffect(() => {
    const roadmapIdChanged = prevActiveRoadmapIdRef.current !== activeRoadmapId
    prevActiveRoadmapIdRef.current = activeRoadmapId

    if (roadmapIdChanged) {
      // Roadmap switched: load saved expandedTaskId and validate it against the
      // current allTasks in this same render. In React 18, activeRoadmapId and
      // phases (which produce allTasks) update in the same batched render, so
      // allTasks here is already B's task list.
      const savedId = activeRoadmapId
        ? storage.getRoadmapUiState(activeRoadmapId)?.expandedTaskId ?? null
        : null
      const valid = savedId !== null && allTasks.some((t) => t.id === savedId) ? savedId : null
      setExpandedTaskId(valid)
      return
    }

    // Same roadmap: clear expanded task if it was deleted from the task list
    if (expandedTaskId && !allTasks.some((t) => t.id === expandedTaskId)) {
      setExpandedTaskId(null)
    }
  // expandedTaskId is read in the same-roadmap branch but intentionally omitted from
  // deps: we only need to re-validate when allTasks changes (covers task deletion),
  // not when the user merely toggles the expanded task.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoadmapId, allTasks])

  // Persist expandedTaskId to UI state.
  // Guard: if expandedTaskId still belongs to the previous roadmap (expandedTaskOwnerRef lags behind),
  // skip this write and advance the owner ref. The persist will fire again once
  // setExpandedTaskId delivers the new roadmap's value.
  useEffect(() => {
    if (!activeRoadmapId) return
    if (expandedTaskOwnerRef.current !== activeRoadmapId) {
      expandedTaskOwnerRef.current = activeRoadmapId
      return
    }
    const current = storage.getRoadmapUiState(activeRoadmapId) ?? {
      schemaVersion: 1 as const,
      openPhaseIds: [],
      expandedTaskId: null,
      updatedAt: new Date().toISOString(),
    }
    storage.setRoadmapUiState(activeRoadmapId, {
      ...current,
      expandedTaskId,
      updatedAt: new Date().toISOString(),
    })
  }, [expandedTaskId, activeRoadmapId])

  useEffect(() => {
    const title = getShortRoadmapTitle(roadmapName)
    document.title = title ? `${title} · Anvilary` : 'Anvilary'
    return () => {
      document.title = 'Anvilary'
    }
  }, [roadmapName])

  // ─── Access-revoked / roadmap-deleted notifications ────────────────────────
  useEffect(() => {
    if (!accessRevokedEvent) return
    showToast(
      accessRevokedEvent === 'revoked'
        ? 'Your access was revoked.'
        : accessRevokedEvent === 'expired'
          ? 'Session expired. Rejoin through an active invite link.'
          : 'This roadmap was deleted.',
    )
    clearAccessRevokedEvent()
  }, [accessRevokedEvent, showToast, clearAccessRevokedEvent])

  const onToggleTask = (id: string) => setExpandedTaskId((prev) => (prev === id ? null : id))

  const taskCountFor = (phaseList: PhaseType[]) => phaseList.reduce((count, phase) => count + phase.tasks.length, 0)

  const {
    pendingTaskDoneIds,
    partialWriteInFlight,
    isTaskDonePatchInFlight,
    patchSyncedTaskDone,
  } = useTaskDonePatch({
    phases,
    setPhases,
    saved,
    setSaved,
    serverRoadmapId,
    sessionToken,
    updatedAt,
    setUpdatedAt,
    showToast,
    onSuccess: () => taskDoneSuccessRef.current(),
    onConflict: (metadata) => taskDoneConflictRef.current(metadata),
    onSessionExpired: () => taskDoneSessionExpiredRef.current(),
  })

  const {
    syncStatus,
    isConflict,
    conflictMetadata,
    showConflictReview,
    keepLocalLoading,
    confirmReload,
    activityRefreshKey,
    addPendingActivityChange,
    replacePendingActivityChanges,
    refreshActivity,
    markServerStateHealthy,
    handleSessionExpired,
    handlePartialWriteConflict,
    handleConfirmSave,
    handleOpenConflictReview,
    handleCloseConflictReview,
    handleKeepLocalVersion,
    handleReloadServerVersion,
    handleReloadConfirm,
    closeReloadConfirm,
  } = useSaveFlow({
    displayName,
    roadmapName,
    setRoadmapName,
    phases,
    setPhases,
    tagRegistry,
    saved,
    setSaved,
    serverRoadmapId,
    setServerRoadmapId,
    sessionToken,
    setSessionToken,
    setParticipantId,
    readOnly,
    setRole,
    setOwnerDisplayName,
    updatedAt,
    setUpdatedAt,
    partialWriteInFlight,
    showActivity,
    closeSave,
    showToast,
    routerReplace: (href) => router.replace(href),
  })

  taskDoneSuccessRef.current = () => {
    markServerStateHealthy()
    if (showActivity) refreshActivity()
  }
  taskDoneConflictRef.current = handlePartialWriteConflict
  taskDoneSessionExpiredRef.current = handleSessionExpired

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
    handleDeleteSubtask,
  } = createTaskMutations({
    phases,
    setPhases,
    setSaved,
    serverRoadmapId,
    sessionToken,
    updatedAt,
    addActivity: addPendingActivityChange,
    showToast,
    setExpandedTaskId,
    readOnly,
    isTaskDonePatchInFlight,
    patchSyncedTaskDone,
  })

  const handleUpdatePhaseColor = (phaseId: string, color: string) => {
    if (readOnly) return

    const phase = phases.find((p) => p.id === phaseId)
    if (!phase || (phase.color === color && phase.colorMode === 'manual')) return

    setPhases(
      phases.map((p) => (
        p.id === phaseId ? { ...p, color, colorMode: 'manual' as const } : p
      )),
    )
    setSaved(false)
  }

  const handleUpdatePhaseColorMode = (phaseId: string, colorMode: 'auto' | 'manual') => {
    if (readOnly) return
    const phase = phases.find((item) => item.id === phaseId)
    if (!phase || phase.colorMode === colorMode) return
    setPhases(phases.map((item) => (
      item.id === phaseId ? { ...item, colorMode } : item
    )))
    setSaved(false)
  }

  const handleUpdatePhaseName = (phaseId: string, name: string) => {
    if (readOnly) return

    const phase = phases.find((p) => p.id === phaseId)
    if (!phase || phase.name === name) return

    setPhases(
      phases.map((p) => (p.id === phaseId ? { ...p, name } : p)),
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

  const handleDeletePhase = (phaseId: string) => {
    if (readOnly) return
    const remaining = phases.filter((p) => p.id !== phaseId)
    setPhases(renumberPhases(remaining))
    setSaved(false)
  }

  const handleRoadmapImported = (importedName: string | undefined, importedPhases: PhaseType[]) => {
    replacePendingActivityChanges([{
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
    markServerStateHealthy()
    if (showActivity) refreshActivity()
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
        sessionExpired={!!sessionExpiredRoadmapId}
        onDismissSessionExpired={clearSessionExpiredNotice}
        onCreateOwn={onCreateOwn}
        onReviewConflict={conflictMetadata ? handleOpenConflictReview : undefined}
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
          filterState={filterState}
          onFilterChange={setFilterField}
          onClearFilters={clearFilters}
          assignmentNames={assignmentNames}
          tagIds={tagIds}
          tagLabels={tagLabels}
          phaseOptions={phaseOptions}
          workspaceView={workspaceView}
          onWorkspaceViewChange={setWorkspaceView}
          allOpen={allOpen}
          onCollapseAll={collapseAll}
          onExpandAll={expandAll}
          onOpenActivity={() => setShowActivity(true)}
          onOpenVersions={() => setShowVersions(true)}
          onOpenTagRegistry={openTagRegistry}
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
            claimedCountByParticipantId={allTasks.reduce<Record<string, number>>((acc, t) => {
              if (t.claimedById && !t.done) {
                acc[t.claimedById] = (acc[t.claimedById] ?? 0) + 1
              }
              return acc
            }, {})}
          />
        ) : (
          <PhaseList
            phases={visiblePhases}
            openPhases={effectiveOpenPhases}
            expandedTaskId={expandedTaskId}
            allTasks={allTasks}
            readOnly={readOnly}
            isFiltering={isFiltering}
            emptyStateMessage={
              filterState.query.trim()
                ? `No tasks match "${filterState.query.trim()}".`
                : 'No tasks match the selected filters.'
            }
            onClearFilters={clearFilters}
            onTogglePhase={togglePhase}
            onToggleTask={onToggleTask}
            onCheckTask={onCheckTask}
            pendingTaskDoneIds={pendingTaskDoneIds}
            onUpdateTask={handleUpdateTask}
            onUpdatePhaseColor={handleUpdatePhaseColor}
            onUpdatePhaseColorMode={handleUpdatePhaseColorMode}
            onUpdatePhaseName={handleUpdatePhaseName}
            onDeletePhase={handleDeletePhase}
            onAddTask={handleAddTask}
            onAddSubtask={handleAddSubtask}
            onLinkDependency={handleLinkDependency}
            onUnlinkDependency={handleUnlinkDependency}
            onReorderTasks={handleReorderTasks}
            onReorderSubtasks={handleReorderSubtasks}
            onDeleteSubtask={handleDeleteSubtask}
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
        showTagRegistry={showTagRegistry}
        onCloseSave={closeSave}
        onCloseShare={closeShare}
        onCloseIO={closeIO}
        onCloseTagRegistry={closeTagRegistry}
        onConfirmSave={handleConfirmSave}
        onToast={showToast}
        onRoadmapImported={handleRoadmapImported}
        readOnly={readOnly}
      />

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      <ConflictReviewPanel
        open={showConflictReview}
        conflict={conflictMetadata}
        localName={roadmapName}
        localPhases={phases}
        keepLocalLoading={keepLocalLoading}
        onClose={handleCloseConflictReview}
        onUseServerVersion={handleReloadServerVersion}
        onKeepLocalVersion={handleKeepLocalVersion}
      />

      <ConfirmDialog
        open={confirmReload}
        title="Reload server version"
        message="Reload the latest server version? Your unsynced local edits will be discarded."
        confirmLabel="Reload"
        tone="danger"
        onConfirm={handleReloadConfirm}
        onClose={closeReloadConfirm}
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
