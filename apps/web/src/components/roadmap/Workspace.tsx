'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ToastViewport } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AppHeader } from '@/components/layout/AppHeader'
import { WorkspaceHead } from './WorkspaceHead'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { PhaseList } from './PhaseList'
import { WorkspaceBanners, WorkspaceUpgradeNotice, WorkspaceWelcomeBanner } from './WorkspaceBanners'
import { WorkspaceModals } from './WorkspaceModals'
import { SyncConflictReviewPanel } from './SyncConflictReviewPanel'
import { ActivityPanel } from './ActivityPanel'
import { TeamPanel } from './TeamPanel'
import { VersionsPanel } from './VersionsPanel'
import { SyncStatusIndicator } from './SyncStatusIndicator'
import {
  useRoadmapData,
  useRoadmapLifecycle,
  useRoadmapSession,
} from '@/context/RoadmapContext'
import { useWorkspaceModals } from '@/hooks/useWorkspaceModals'
import { useWorkspaceViewModel } from '@/hooks/useWorkspaceViewModel'
import { useToastState } from '@/hooks/useToastState'
import { useSaveFlow } from '@/hooks/useSaveFlow'
import { useWorkspaceParticipants } from '@/hooks/useWorkspaceParticipants'
import { useParticipantRevocation } from '@/hooks/useParticipantRevocation'
import { createTaskMutations } from '@/hooks/useTaskMutations'
import { usePhaseMutations } from '@/hooks/usePhaseMutations'
import { useTaskDonePatch } from '@/hooks/useTaskDonePatch'
import { useTaskPatch } from '@/hooks/useTaskPatch'
import { useExpandedTaskState } from '@/hooks/useExpandedTaskState'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import type { ImportMode } from '@/lib/import-merge/types'
import { resolveWorkspaceSyncStatus } from '@/lib/sync-status'
import type { WorkspaceMode, Phase as PhaseType, Roadmap, RoadmapConflictMetadata } from '@/types/roadmap'
import { storage } from '@/lib/storage'

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
    setTagRegistry,
    saved,
    setSaved,
    ownerDisplayName,
    setOwnerDisplayName,
    updatedAt,
    setUpdatedAt,
    isSample,
  } = useRoadmapData()
  const {
    serverRoadmapId,
    setServerRoadmapId,
    sessionToken,
    setSessionToken,
    participantId,
    setParticipantId,
    role,
    setRole,
  } = useRoadmapSession()
  const {
    activeRoadmapId,
    accessRevokedEvent,
    clearAccessRevokedEvent,
    sessionExpiredRoadmapId,
    clearSessionExpiredNotice,
    roadmapUpgradeNotice,
    dismissRoadmapUpgradeNotice,
    realtimeStatus,
  } = useRoadmapLifecycle()
  const readOnly = mode === 'viewer' || role === 'viewer'
  const canManageShare = role === 'owner'
  const canRenameRoadmap = !readOnly

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
  const [showOnboarding, setShowOnboarding] = useState(() => !storage.hasDismissedOnboarding())

  const handleDismissOnboarding = () => {
    setShowOnboarding(false)
    if (activeRoadmapId) {
      storage.setOnboardingDismissed(activeRoadmapId, true)
    }
  }

  const handleCreateOwn = () => {
    if (activeRoadmapId) {
      storage.setOnboardingDismissed(activeRoadmapId, true)
    }
    setShowOnboarding(false)
    onCreateOwn?.()
  }

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
  const {
    pendingRevokeParticipant,
    revokeLoading,
    requestRevokeParticipant,
    confirmRevokeParticipant,
    cancelRevokeParticipant,
  } = useParticipantRevocation({
    serverRoadmapId,
    sessionToken,
    setParticipants,
    setParticipantsError,
    refreshParticipants,
    showToast,
  })

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
  const {
    expandedTaskId,
    setExpandedTaskId,
    toggleExpandedTask,
  } = useExpandedTaskState({ activeRoadmapId, allTasks })

  useEffect(() => {
    const title = getShortRoadmapTitle(roadmapName)
    document.title = title
      ? `${title} · RoadForge · Public Alpha`
      : 'RoadForge · Public Alpha'
    return () => {
      document.title = 'RoadForge · Public Alpha'
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

  const taskCountFor = (phaseList: PhaseType[]) => phaseList.reduce((count, phase) => count + phase.tasks.length, 0)

  const {
    pendingTaskDoneIds,
    partialWriteInFlight: taskDonePatchInFlight,
    isTaskDonePatchInFlight,
    patchSyncedTaskDone,
  } = useTaskDonePatch({
    phases,
    setPhases,
    setTagRegistry,
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
    taskPatchInFlight,
    patchSyncedTask,
  } = useTaskPatch({
    phases,
    setPhases,
    setTagRegistry,
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
  const partialWriteInFlight = taskDonePatchInFlight || taskPatchInFlight

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
  const workspaceSyncStatus = resolveWorkspaceSyncStatus(syncStatus, realtimeStatus)

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
    patchSyncedTask,
  })

  const {
    handleUpdatePhaseColor,
    handleUpdatePhaseColorMode,
    handleUpdatePhaseName,
    handleReorderPhases,
    handleDeletePhase,
  } = usePhaseMutations({
    phases,
    setPhases,
    setSaved,
    readOnly,
    serverRoadmapId,
    addPendingActivityChange,
  })

  const handleRoadmapImported = (
    importedName: string | undefined,
    importedPhases: PhaseType[],
    importMode: ImportMode,
  ) => {
    replacePendingActivityChanges([{
      action: importMode === 'replace-current' ? 'import.replaced' : 'roadmap.imported',
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
        {showOnboarding && (
          <WorkspaceWelcomeBanner
            onDismiss={handleDismissOnboarding}
            onCreateOwn={handleCreateOwn}
          />
        )}
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
          isSample={isSample}
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
          canViewVersions={
            (role === 'owner' || role === 'editor') && !!serverRoadmapId && !!sessionToken
          }
        />
        {workspaceView === 'team' && canViewTeam ? (
          <TeamPanel
            participants={participants}
            loading={participantsLoading}
            error={participantsError}
            canManageParticipants={canManageShare}
            onInvite={openShare}
            onRevokeParticipant={requestRevokeParticipant}
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
            onToggleTask={toggleExpandedTask}
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
      <SyncStatusIndicator status={workspaceSyncStatus} />

      <SyncConflictReviewPanel
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
        onConfirm={confirmRevokeParticipant}
        onClose={cancelRevokeParticipant}
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
          canManageVersions={role === 'owner'}
        />
      )}
    </div>
  )
}
