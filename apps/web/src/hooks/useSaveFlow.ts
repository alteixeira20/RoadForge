'use client'

import { useState } from 'react'
import { useAutoSync } from '@/hooks/useAutoSync'
import { createRoadmap, getRoadmap, saveToServer } from '@/services/roadmap-crud.service'
import { isApiConnectionError, isSessionExpiredError } from '@/services/roadmap-http'
import { buildChangeSummary, mergePendingActivityChange } from '@/lib/activity-changes'
import { normalizePhasesProgress } from '@/lib/phase-progress'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import { storage } from '@/lib/storage'
import type { ActivityChange, Phase, ShareRole } from '@/types/roadmap'

interface UseSaveFlowParams {
  displayName: string
  roadmapName: string
  setRoadmapName: (name: string) => void
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  saved: boolean
  setSaved: (saved: boolean) => void
  serverRoadmapId: string | null
  setServerRoadmapId: (id: string | null) => void
  sessionToken: string | null
  setSessionToken: (token: string | null) => void
  setParticipantId: (participantId: string | null) => void
  readOnly: boolean
  setRole: (role: ShareRole | null) => void
  setOwnerDisplayName: (name: string) => void
  updatedAt: string | null
  setUpdatedAt: (updatedAt: string) => void
  showActivity: boolean
  closeSave: () => void
  showToast: (message: string) => void
  routerReplace: (href: string) => void
}

export function useSaveFlow({
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
  routerReplace,
}: UseSaveFlowParams) {
  const [activityRefreshKey, setActivityRefreshKey] = useState(0)
  const [pendingActivityChanges, setPendingActivityChanges] = useState<ActivityChange[]>([])
  const [confirmReload, setConfirmReload] = useState(false)

  const addPendingActivityChange = (change: ActivityChange) => {
    setPendingActivityChanges((prev) => mergePendingActivityChange(prev, change))
  }

  const clearPendingActivityChanges = () => setPendingActivityChanges([])
  const refreshActivity = () => setActivityRefreshKey((k) => k + 1)

  function handleSessionExpired() {
    if (serverRoadmapId) {
      storage.setAuthCache(serverRoadmapId, null)
      const cached = storage.getRoadmapCache(serverRoadmapId)
      if (cached) storage.setRoadmapCache(serverRoadmapId, { ...cached, saved: false })
    }
    setServerRoadmapId(null)
    setSessionToken(null)
    setParticipantId(null)
    setRole(null)
    setSaved(false)
    setIsOffline(true)
    showToast('Session expired. Rejoin through an active invite link.')
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
    onActivityRefresh: refreshActivity,
    onToast: showToast,
    onSessionExpired: handleSessionExpired,
  })

  const markServerStateHealthy = () => {
    setIsOffline(false)
    setIsConflict(false)
  }

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
        routerReplace(`/workspace?roadmap=${encodeURIComponent(nextRoadmapId)}`)
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
      } else if (isSessionExpiredError(err)) {
        handleSessionExpired()
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
      } else if (isSessionExpiredError(err)) {
        handleSessionExpired()
      } else if (msg.includes('401') || msg.includes('403')) {
        showToast('Session expired — rejoin from the invite link.')
      } else {
        showToast('Could not reload server version.')
      }
    }
  }

  const closeReloadConfirm = () => setConfirmReload(false)

  return {
    syncStatus,
    isConflict,
    confirmReload,
    activityRefreshKey,
    pendingActivityChanges,

    addPendingActivityChange,
    setPendingActivityChanges,
    clearPendingActivityChanges,
    refreshActivity,
    markServerStateHealthy,

    handleConfirmSave,
    handleReloadServerVersion,
    handleReloadConfirm,
    closeReloadConfirm,
  }
}
