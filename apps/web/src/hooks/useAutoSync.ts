'use client'

import { useState, useRef, useEffect } from 'react'
import { saveToServer } from '@/services/roadmap-crud.service'
import { buildChangeSummary } from '@/lib/activity-changes'
import { classifyRoadmapSaveError } from '@/lib/roadmap-sync-errors'
import type { Phase, ActivityChange, RoadmapConflictMetadata, SyncStatus, TagDefinition } from '@/types/roadmap'

interface AutoSyncParams {
  serverRoadmapId: string | null
  sessionToken: string | null
  readOnly: boolean
  saved: boolean
  phases: Phase[]
  roadmapName: string
  tagRegistry: TagDefinition[]
  updatedAt: string | null
  pendingActivityChanges: ActivityChange[]
  partialWriteInFlight: boolean
  showActivity: boolean
  onSyncSuccess: (
    updatedAt: string,
    isCurrent: boolean,
    acknowledgedActivityChanges: ActivityChange[],
  ) => void
  onActivityRefresh: () => void
  onToast: (msg: string) => void
  onSessionExpired: () => void
  onConflictMetadata?: (metadata: RoadmapConflictMetadata) => void
}

interface AutoSyncResult {
  isSyncing: boolean
  isOffline: boolean
  isConflict: boolean
  conflictMetadata: RoadmapConflictMetadata | null
  setIsOffline: (v: boolean) => void
  setIsConflict: (v: boolean) => void
  setConflictMetadata: (v: RoadmapConflictMetadata | null) => void
  syncStatus: SyncStatus
}

export function useAutoSync({
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
  onSyncSuccess,
  onActivityRefresh,
  onToast,
  onSessionExpired,
  onConflictMetadata,
}: AutoSyncParams): AutoSyncResult {
  const [isSyncing, setIsSyncing] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [isConflict, setIsConflict] = useState(false)
  const [hasSaveError, setHasSaveError] = useState(false)
  const [conflictMetadata, setConflictMetadata] = useState<RoadmapConflictMetadata | null>(null)

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref prevents concurrent autosync calls without adding isSyncing to effect deps
  const isSyncingRef = useRef(false)
  // Bumped whenever any shared roadmap data changes, so an in-flight request
  // cannot mark a newer phase, name, or tag edit as already saved.
  const revisionRef = useRef(0)
  const lastEditedSnapshotRef = useRef({ phases, roadmapName, tagRegistry })
  // Holds latest values so the debounced callback is never stale
  const syncParamsRef = useRef({
    phases,
    roadmapName,
    tagRegistry,
    updatedAt,
    pendingActivityChanges: [] as ActivityChange[],
    serverRoadmapId,
    sessionToken,
    saved,
    partialWriteInFlight,
    showActivity,
    onSyncSuccess,
    onActivityRefresh,
    onToast,
    onSessionExpired,
    onConflictMetadata,
  })

  // Keep ref fresh so the debounced callback always reads the latest values
  syncParamsRef.current = {
    phases,
    roadmapName,
    tagRegistry,
    updatedAt,
    pendingActivityChanges,
    serverRoadmapId,
    sessionToken,
    saved,
    partialWriteInFlight,
    showActivity,
    onSyncSuccess,
    onActivityRefresh,
    onToast,
    onSessionExpired,
    onConflictMetadata,
  }

  useEffect(() => {
    if (saved) setHasSaveError(false)
  }, [saved])

  // ─── Debounced autosync for server-backed roadmaps ─────────────────────────
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

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    if (!serverRoadmapId || !sessionToken || readOnly || saved || partialWriteInFlight) return

    const requestRevision = revisionRef.current
    let cancelled = false

    const runSync = async () => {
      if (isSyncingRef.current) {
        if (!cancelled) syncTimerRef.current = setTimeout(runSync, 250)
        return
      }
      isSyncingRef.current = true
      setIsSyncing(true)
      setHasSaveError(false)

      const {
        phases: p,
        roadmapName: n,
        tagRegistry: tr,
        updatedAt: ua,
        pendingActivityChanges: pac,
        serverRoadmapId: rid,
        sessionToken: tok,
        saved: currentSaved,
        partialWriteInFlight: currentPartialWriteInFlight,
        showActivity: showAct,
        onSyncSuccess: syncSuccess,
        onActivityRefresh: activityRefresh,
        onToast: toast,
        onSessionExpired: sessionExpired,
        onConflictMetadata: openConflict,
      } = syncParamsRef.current

      if (!rid || !tok || currentSaved || currentPartialWriteInFlight) {
        isSyncingRef.current = false
        setIsSyncing(false)
        return
      }
      if (!ua) {
        isSyncingRef.current = false
        setIsSyncing(false)
        setIsOffline(true)
        toast('Reload the server roadmap before saving again')
        return
      }

      const changeSummary = buildChangeSummary(pac, rid)
      try {
        const data = await saveToServer(rid, n, p, tok, ua, changeSummary, tr)
        syncSuccess(data.updated_at, requestRevision === revisionRef.current, pac)
        setIsOffline(false)
        setIsConflict(false)
        setHasSaveError(false)
        setConflictMetadata(null)
        if (showAct) activityRefresh()
      } catch (err) {
        const {
          kind,
          conflictMetadata: nextConflict,
          hasLegacyConflictStatus,
          validationMessage,
        } = classifyRoadmapSaveError(err)
        if (kind === 'conflict' || hasLegacyConflictStatus) {
          setIsConflict(true)
          setConflictMetadata(nextConflict)
          if (nextConflict) openConflict?.(nextConflict)
          setIsOffline(false)
          setHasSaveError(false)
          toast('The roadmap changed elsewhere. Your edits are preserved locally.')
        } else if (kind === 'session-expired' || kind === 'unauthorized') {
          sessionExpired()
        } else if (kind === 'validation') {
          setIsOffline(false)
          setHasSaveError(true)
          toast(validationMessage ?? 'Save rejected: the server could not validate this roadmap.')
        } else if (kind === 'connection') {
          setIsOffline(true)
          setHasSaveError(false)
          toast('Could not reach the server. Your edits are preserved locally.')
        } else if (kind === 'forbidden') {
          setIsOffline(false)
          setHasSaveError(true)
          toast('You do not have permission to save this roadmap. Your edits are preserved locally.')
        } else {
          setIsOffline(false)
          setHasSaveError(true)
          toast('Save failed unexpectedly. Your edits are preserved locally.')
        }
      } finally {
        isSyncingRef.current = false
        setIsSyncing(false)
      }
    }

    syncTimerRef.current = setTimeout(runSync, 1500)

    return () => {
      cancelled = true
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  // Shared roadmap data resets the debounce; other values are read from refs.
  }, [
    serverRoadmapId,
    sessionToken,
    readOnly,
    saved,
    partialWriteInFlight,
    phases,
    roadmapName,
    tagRegistry,
  ])

  const syncStatus: SyncStatus = !serverRoadmapId
    ? 'local'
    : isSyncing
      ? 'syncing'
      : isConflict
        ? 'conflict'
        : isOffline
          ? 'offline'
          : hasSaveError
            ? 'error'
            : !saved && !readOnly
              ? 'syncing'
              : 'live'

  return {
    isSyncing,
    isOffline,
    isConflict,
    conflictMetadata,
    setIsOffline,
    setIsConflict,
    setConflictMetadata,
    syncStatus,
  }
}
