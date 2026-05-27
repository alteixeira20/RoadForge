'use client'

import { useState, useEffect } from 'react'
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
import { useWorkspaceViewModel } from '@/hooks/useWorkspaceViewModel'
import { useToastState } from '@/hooks/useToastState'
import { useSaveFlow } from '@/hooks/useSaveFlow'
import { useWorkspaceParticipants } from '@/hooks/useWorkspaceParticipants'
import { createTaskMutations } from '@/hooks/useTaskMutations'
import { revokeParticipant } from '@/services/roadmap-sharing.service'
import { renumberPhases } from '@/lib/phase-progress'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import type { WorkspaceMode, Phase as PhaseType, Participant, Roadmap } from '@/types/roadmap'

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
    saved,
    setSaved,
    serverRoadmapId,
    setServerRoadmapId,
    sessionToken,
    setSessionToken,
    setParticipantId,
    role,
    setRole,
    ownerDisplayName,
    setOwnerDisplayName,
    updatedAt,
    setUpdatedAt,
    accessRevokedEvent,
    clearAccessRevokedEvent,
    sessionExpiredRoadmapId,
    clearSessionExpiredNotice,
    roadmapUpgradeNotice,
    dismissRoadmapUpgradeNotice,
  } = useRoadmap()
  const readOnly = mode === 'viewer'
  const canManageShare = role === 'owner'
  const canRenameRoadmap = !readOnly && (!serverRoadmapId || role !== 'viewer')

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>('RF-05')
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
  const [pendingRevokeParticipant, setPendingRevokeParticipant] = useState<Participant | null>(null)
  const [revokeLoading, setRevokeLoading] = useState(false)

  // ─── Effective State ───────────────────────────────────────────────────────
  const {
    allTasks,
    totalDone,
    nextReadyCount,
    canViewTeam,
    searchQuery,
    setSearchQuery,
    taskFilter,
    setTaskFilter,
    taskFilterOptions,
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
    participants,
    displayName,
    role,
    serverRoadmapId,
    sessionToken,
  })

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
        : accessRevokedEvent === 'expired'
          ? 'Session expired. Rejoin through an active invite link.'
          : 'This roadmap was deleted.',
    )
    clearAccessRevokedEvent()
  }, [accessRevokedEvent, showToast, clearAccessRevokedEvent])

  const onToggleTask = (id: string) => setExpandedTaskId((prev) => (prev === id ? null : id))

  const taskCountFor = (phaseList: PhaseType[]) => phaseList.reduce((count, phase) => count + phase.tasks.length, 0)

  const {
    syncStatus,
    isConflict,
    confirmReload,
    activityRefreshKey,
    addPendingActivityChange,
    setPendingActivityChanges,
    refreshActivity,
    markServerStateHealthy,
    handleConfirmSave,
    handleReloadServerVersion,
    handleReloadConfirm,
    closeReloadConfirm,
  } = useSaveFlow({
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
    setParticipantId,
    readOnly,
    setRole,
    setOwnerDisplayName,
    updatedAt,
    setUpdatedAt,
    showActivity,
    closeSave,
    showToast,
    routerReplace: (href) => router.replace(href),
  })

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
  } = createTaskMutations({
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
          onWorkspaceViewChange={setWorkspaceView}
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
