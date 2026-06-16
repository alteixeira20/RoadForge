'use client'

import { useState } from 'react'
import { useAutoSync } from '@/hooks/useAutoSync'
import { createRoadmap, getRoadmap, saveToServer } from '@/services/roadmap-crud.service'
import { getConflictMetadata, isApiConnectionError, isApiError, isAuthError, isConflictError, isSessionExpiredError } from '@/services/roadmap-http'
import { buildChangeSummary, mergePendingActivityChange } from '@/lib/activity-changes'
import { normalizePhasesProgress } from '@/lib/phase-progress'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import { storage } from '@/lib/storage'
import type { ActivityChange, Phase, RoadmapConflictMetadata, ShareRole, TagDefinition } from '@/types/roadmap'

interface UseSaveFlowParams {
  displayName: string
  roadmapName: string
  setRoadmapName: (name: string) => void
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  tagRegistry: TagDefinition[]
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
  partialWriteInFlight: boolean
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
  routerReplace,
}: UseSaveFlowParams) {
  const [activityRefreshKey, setActivityRefreshKey] = useState(0)
  const [pendingActivityChanges, setPendingActivityChanges] = useState<ActivityChange[]>([])
  const [confirmReload, setConfirmReload] = useState(false)
  const [showConflictReview, setShowConflictReview] = useState(false)
  const [keepLocalLoading, setKeepLocalLoading] = useState(false)

  const addPendingActivityChange = (change: ActivityChange) => {
    setPendingActivityChanges((prev) => mergePendingActivityChange(prev, change))
  }

  const clearPendingActivityChanges = () => setPendingActivityChanges([])
  const replacePendingActivityChanges = (changes: ActivityChange[]) => {
    setPendingActivityChanges(changes)
  }
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

  const {
    isConflict,
    conflictMetadata,
    setIsOffline,
    setIsConflict,
    setConflictMetadata,
    syncStatus,
  } = useAutoSync({
    serverRoadmapId,
    sessionToken,
    readOnly,
    saved,
    phases,
    roadmapName,
    tagRegistry,
    updatedAt,
    pendingActivityChanges,
    partialWriteInFlight,
    showActivity,
    onSyncSuccess: (newUpdatedAt) => {
      setUpdatedAt(newUpdatedAt)
      setSaved(true)
      setPendingActivityChanges([])
    },
    onActivityRefresh: refreshActivity,
    onToast: showToast,
    onSessionExpired: handleSessionExpired,
    onConflictMetadata: () => {
      setShowConflictReview(true)
    },
  })

  const markServerStateHealthy = () => {
    setIsOffline(false)
    setIsConflict(false)
    setConflictMetadata(null)
  }

  const handlePartialWriteConflict = (metadata: RoadmapConflictMetadata | null) => {
    setIsConflict(true)
    setConflictMetadata(metadata)
    if (metadata) setShowConflictReview(true)
    setIsOffline(false)
  }

  const handleConfirmSave = async (password?: string) => {
    closeSave()
    if (partialWriteInFlight) {
      showToast('Wait for the task update to finish before saving.')
      return
    }
    const changeSummary = buildChangeSummary(pendingActivityChanges, serverRoadmapId)
    try {
      if (!serverRoadmapId) {
        // First save: no bearer token needed — create returns a new owner session.
        const { roadmap, ownerSessionToken } = await createRoadmap(
          roadmapName,
          displayName || 'Owner',
          phases,
          tagRegistry,
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
        if (!updatedAt) {
          showToast('Reload the server roadmap before saving again')
          return
        }
        const data = await saveToServer(serverRoadmapId, roadmapName, phases, sessionToken, updatedAt, changeSummary, tagRegistry)
        setUpdatedAt(data.updated_at)
        setPendingActivityChanges([])
      }
      setSaved(true)
      setIsOffline(false)
      setIsConflict(false)
      setConflictMetadata(null)
      if (showActivity) setActivityRefreshKey((k) => k + 1)
      showToast('Saved · collaboration enabled')
    } catch (err) {
      const nextConflict = getConflictMetadata(err)
      if (nextConflict || isConflictError(err)) {
        setIsConflict(true)
        setConflictMetadata(nextConflict)
        if (nextConflict) {
          setShowConflictReview(true)
        }
        showToast('The roadmap changed elsewhere. Your edits are preserved locally.')
      } else if (isSessionExpiredError(err)) {
        handleSessionExpired()
      } else if (isApiError(err, 401)) {
        showToast('Session expired — rejoin from the invite link')
      } else if (isApiError(err, 403)) {
        showToast('You do not have permission for this action')
      } else if (isApiConnectionError(err)) {
        showToast('Anvilary API is not reachable. Start the backend with make start.')
      } else {
        showToast('Save failed — check backend connection')
      }
    }
  }

  const handleReloadServerVersion = () => {
    if (!serverRoadmapId || !sessionToken) return
    setShowConflictReview(false)
    setConfirmReload(true)
  }

  const handleOpenConflictReview = () => {
    setShowConflictReview(true)
  }
  const handleCloseConflictReview = () => {
    setShowConflictReview(false)
  }

  const handleKeepLocalVersion = async (): Promise<string | null> => {
    if (!serverRoadmapId || !sessionToken || !conflictMetadata) return null

    setKeepLocalLoading(true)
    const changeSummary = buildChangeSummary(pendingActivityChanges, serverRoadmapId)
    try {
      const data = await saveToServer(
        serverRoadmapId,
        roadmapName,
        phases,
        sessionToken,
        conflictMetadata.server_updated_at,
        changeSummary,
        tagRegistry,
      )
      setUpdatedAt(data.updated_at)
      setPendingActivityChanges([])
      setSaved(true)
      setIsConflict(false)
      setConflictMetadata(null)
      setIsOffline(false)
      setShowConflictReview(false)
      if (showActivity) setActivityRefreshKey((k) => k + 1)
      showToast('Saved your local version.')
      return null
    } catch (err) {
      const nextConflict = getConflictMetadata(err)
      if (nextConflict || isConflictError(err)) {
        setIsConflict(true)
        if (nextConflict) setConflictMetadata(nextConflict)
        showToast('The server changed again. Review the latest conflict.')
        return 'The server changed again. Review the latest conflict.'
      } else if (isSessionExpiredError(err)) {
        handleSessionExpired()
        return 'Session expired. Rejoin through an active invite link before resolving this conflict.'
      } else if (isApiConnectionError(err)) {
        setIsOffline(true)
        showToast('Could not reach the server — try again later.')
        return 'Could not reach the server. Your local edits are still preserved in this browser.'
      } else {
        showToast('Could not keep your local version.')
        return 'Could not keep your local version. Your local edits are still preserved in this browser.'
      }
    } finally {
      setKeepLocalLoading(false)
    }
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
      setConflictMetadata(null)
      setShowConflictReview(false)
      setIsOffline(false)
      showToast('Reloaded server version.')
    } catch (err) {
      if (isApiConnectionError(err)) {
        showToast('Could not reach the server — try again later.')
      } else if (isSessionExpiredError(err)) {
        handleSessionExpired()
      } else if (isAuthError(err)) {
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
    conflictMetadata,
    showConflictReview,
    keepLocalLoading,
    confirmReload,
    activityRefreshKey,
    pendingActivityChanges,

    addPendingActivityChange,
    replacePendingActivityChanges,
    clearPendingActivityChanges,
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
  }
}
