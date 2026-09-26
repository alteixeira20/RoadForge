'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRoadmapData } from '@/context/RoadmapContext'
import { useAutoSync } from '@/hooks/useAutoSync'
import { createRoadmap, getRoadmap, saveToServer } from '@/services/roadmap-crud.service'
import {
  buildChangeSummary,
  mergePendingActivityChange,
  removeAcknowledgedActivityChanges,
} from '@/lib/activity-changes'
import { normalizePhasesProgress } from '@/lib/phase-progress'
import { classifyRoadmapSaveError } from '@/lib/roadmap-sync-errors'
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
  const { setTagRegistry } = useRoadmapData()
  const [activityRefreshKey, setActivityRefreshKey] = useState(0)
  const [pendingActivityChanges, setPendingActivityChanges] = useState<ActivityChange[]>([])
  const [confirmReload, setConfirmReload] = useState(false)
  const [showConflictReview, setShowConflictReview] = useState(false)
  const [keepLocalLoading, setKeepLocalLoading] = useState(false)
  const [manualSaveInFlight, setManualSaveInFlight] = useState(false)
  const manualSaveInFlightRef = useRef(false)

  const revisionRef = useRef(0)
  const lastEditedSnapshotRef = useRef({ phases, roadmapName, tagRegistry })
  useEffect(() => {
    const previous = lastEditedSnapshotRef.current
    if (
      phases !== previous.phases
      || roadmapName !== previous.roadmapName
      || tagRegistry !== previous.tagRegistry
    ) {
      revisionRef.current += 1
      lastEditedSnapshotRef.current = { phases, roadmapName, tagRegistry }
    }
  }, [phases, roadmapName, tagRegistry])

  const updatedAtRef = useRef(updatedAt)
  updatedAtRef.current = updatedAt

  const serverRoadmapIdRef = useRef(serverRoadmapId)
  serverRoadmapIdRef.current = serverRoadmapId

  const savedRef = useRef(saved)
  savedRef.current = saved

  const safeSetUpdatedAt = useCallback((next: string) => {
    const current = updatedAtRef.current
    if (!current) {
      setUpdatedAt(next)
      return
    }
    const nextTime = new Date(next).getTime()
    const currentTime = new Date(current).getTime()
    if (isNaN(nextTime) || isNaN(currentTime) || nextTime >= currentTime) {
      setUpdatedAt(next)
    }
  }, [setUpdatedAt])

  const addPendingActivityChange = useCallback((change: ActivityChange) => {
    setPendingActivityChanges((prev) => mergePendingActivityChange(prev, change))
  }, [])

  const replacePendingActivityChanges = useCallback((changes: ActivityChange[]) => {
    setPendingActivityChanges(changes)
  }, [])
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
    waitForSync,
    isSyncing,
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
    manualSaveInFlight,
    showActivity,
    onSyncSuccess: (newUpdatedAt, isCurrent, acknowledgedActivityChanges) => {
      safeSetUpdatedAt(newUpdatedAt)
      setPendingActivityChanges((pending) => (
        removeAcknowledgedActivityChanges(pending, acknowledgedActivityChanges)
      ))
      // Skip if edits landed after this request captured its snapshot:
      // marking saved here would hide those edits from the next autosync.
      if (!isCurrent) return
      savedRef.current = true
      setSaved(true)
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
      showToast('Wait for the focused roadmap update to finish before saving.')
      return
    }
    if (manualSaveInFlightRef.current) {
      return
    }
    if (isSyncing) {
      await waitForSync()
      if (savedRef.current) {
        showToast('Saved and ready to share.')
        return
      }
    }
    manualSaveInFlightRef.current = true
    setManualSaveInFlight(true)

    const requestRevision = revisionRef.current
    const outgoingActivityChanges = [...pendingActivityChanges]
    const targetRoadmapId = serverRoadmapId
    const changeSummary = buildChangeSummary(outgoingActivityChanges, serverRoadmapId)

    try {
      if (!serverRoadmapId) {
        // First save: no bearer token needed, create returns a complete owner session.
        const { roadmap, ownerParticipantId, ownerSessionToken } = await createRoadmap(
          roadmapName,
          displayName || 'Owner',
          phases,
          tagRegistry,
          password,
          changeSummary,
        )
        if (serverRoadmapIdRef.current !== targetRoadmapId) return
        const nextRoadmapId = roadmap.roadmap.id
        setServerRoadmapId(nextRoadmapId)
        setSessionToken(ownerSessionToken)
        setParticipantId(ownerParticipantId)
        setRole('owner')
        setOwnerDisplayName(roadmap.ownerDisplayName)
        safeSetUpdatedAt(roadmap.updatedAt)
        setPendingActivityChanges((pending) => (
          removeAcknowledgedActivityChanges(pending, outgoingActivityChanges)
        ))
        if (requestRevision === revisionRef.current) {
          setSaved(true)
          setIsOffline(false)
          setIsConflict(false)
          setConflictMetadata(null)
        }
        routerReplace(`/workspace?roadmap=${encodeURIComponent(nextRoadmapId)}`)
      } else {
        if (!sessionToken) {
          showToast('Session expired. Rejoin from an active invite link.')
          return
        }
        if (!updatedAt) {
          showToast('Reload the server roadmap before saving again.')
          return
        }
        const data = await saveToServer(
          serverRoadmapId,
          roadmapName,
          phases,
          sessionToken,
          updatedAt,
          changeSummary,
          tagRegistry,
        )
        if (serverRoadmapIdRef.current !== targetRoadmapId) return
        safeSetUpdatedAt(data.updated_at)
        setPendingActivityChanges((pending) => (
          removeAcknowledgedActivityChanges(pending, outgoingActivityChanges)
        ))
        if (requestRevision === revisionRef.current) {
          setSaved(true)
          setIsOffline(false)
          setIsConflict(false)
          setConflictMetadata(null)
        }
      }
      if (showActivity) setActivityRefreshKey((k) => k + 1)
      showToast('Saved and ready to share.')
    } catch (err) {
      if (serverRoadmapIdRef.current !== targetRoadmapId) return
      const { kind, conflictMetadata: nextConflict, validationMessage } = classifyRoadmapSaveError(err)
      if (kind === 'conflict') {
        setIsConflict(true)
        setConflictMetadata(nextConflict)
        if (nextConflict) setShowConflictReview(true)
        showToast('The roadmap changed elsewhere. Your edits are preserved locally.')
      } else if (kind === 'session-expired') {
        handleSessionExpired()
      } else if (kind === 'unauthorized') {
        handleSessionExpired()
      } else if (kind === 'forbidden') {
        showToast('You do not have permission for this action.')
      } else if (kind === 'validation') {
        showToast(validationMessage ?? 'RoadForge could not save this roadmap because some data is invalid.')
      } else if (kind === 'connection') {
        showToast('Could not reach RoadForge. Your work is still saved in this browser.')
      } else {
        showToast('Could not save to the server. Your work is still saved in this browser.')
      }
    } finally {
      manualSaveInFlightRef.current = false
      setManualSaveInFlight(false)
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

    if (manualSaveInFlightRef.current) return null
    if (isSyncing) {
      await waitForSync()
    }
    manualSaveInFlightRef.current = true
    setManualSaveInFlight(true)
    setKeepLocalLoading(true)

    const requestRevision = revisionRef.current
    const outgoingActivityChanges = [...pendingActivityChanges]
    const targetRoadmapId = serverRoadmapId
    const changeSummary = buildChangeSummary(outgoingActivityChanges, serverRoadmapId)

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
      if (serverRoadmapIdRef.current !== targetRoadmapId) return null
      safeSetUpdatedAt(data.updated_at)
      setPendingActivityChanges((pending) => (
        removeAcknowledgedActivityChanges(pending, outgoingActivityChanges)
      ))
      if (requestRevision === revisionRef.current) {
        setSaved(true)
        setIsConflict(false)
        setConflictMetadata(null)
      }
      setIsOffline(false)
      setShowConflictReview(false)
      if (showActivity) setActivityRefreshKey((k) => k + 1)
      showToast('Saved your local version.')
      return null
    } catch (err) {
      if (serverRoadmapIdRef.current !== targetRoadmapId) return null
      const {
        kind,
        conflictMetadata: nextConflict,
        validationMessage,
      } = classifyRoadmapSaveError(err)
      if (kind === 'conflict') {
        setIsConflict(true)
        if (nextConflict) setConflictMetadata(nextConflict)
        showToast('The server changed again. Review the latest conflict.')
        return 'The server changed again. Review the latest conflict.'
      } else if (kind === 'session-expired' || kind === 'unauthorized') {
        handleSessionExpired()
        return 'Session expired. Rejoin through an active invite link before resolving this conflict.'
      } else if (kind === 'forbidden') {
        showToast('You do not have permission to replace the server version.')
        return 'You do not have permission to replace the server version. Your local edits are unchanged.'
      } else if (kind === 'validation') {
        const message = validationMessage ?? 'The server rejected this roadmap.'
        showToast(message)
        return `${message} Your local edits are unchanged.`
      } else if (kind === 'connection') {
        setIsOffline(true)
        showToast('Could not reach the server. Try again later.')
        return 'Could not reach the server. Your local edits are still preserved in this browser.'
      } else {
        showToast('Could not keep your local version.')
        return 'Could not keep your local version. Your local edits are still preserved in this browser.'
      }
    } finally {
      manualSaveInFlightRef.current = false
      setManualSaveInFlight(false)
      setKeepLocalLoading(false)
    }
  }

  const handleReloadConfirm = async () => {
    if (!serverRoadmapId || !sessionToken) return
    const targetRoadmapId = serverRoadmapId
    setConfirmReload(false)
    try {
      const loaded = await getRoadmap(serverRoadmapId, sessionToken)
      if (serverRoadmapIdRef.current !== targetRoadmapId) return
      const upgraded = upgradeRoadmapSnapshot({
        roadmapName: loaded.roadmap.name,
        phases: loaded.phases,
      })
      setRoadmapName(upgraded.roadmapName || loaded.roadmap.name)
      setPhases(normalizePhasesProgress(upgraded.phases))
      setTagRegistry(loaded.tagRegistry ?? [])
      setOwnerDisplayName(loaded.ownerDisplayName)
      safeSetUpdatedAt(loaded.updatedAt)
      setPendingActivityChanges([])
      setSaved(!upgraded.changed)
      setIsConflict(false)
      setConflictMetadata(null)
      setShowConflictReview(false)
      setIsOffline(false)
      showToast('Reloaded the server version.')
    } catch (err) {
      if (serverRoadmapIdRef.current !== targetRoadmapId) return
      const { kind } = classifyRoadmapSaveError(err)
      if (kind === 'connection') {
        showToast('Could not reach the server. Try again later.')
      } else if (kind === 'session-expired') {
        handleSessionExpired()
      } else if (kind === 'unauthorized') {
        handleSessionExpired()
      } else if (kind === 'forbidden') {
        showToast('You do not have permission to reload this roadmap.')
      } else {
        showToast('Could not reload the server version.')
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
  }
}
