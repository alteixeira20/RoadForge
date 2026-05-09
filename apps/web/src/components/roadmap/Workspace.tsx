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
import type { WorkspaceMode } from '@/types/roadmap'

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
