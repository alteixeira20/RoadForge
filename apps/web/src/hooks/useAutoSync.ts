'use client'

import { useState, useRef, useEffect } from 'react'
import { saveToServer } from '@/services/roadmap-crud.service'
import { getConflictMetadata, isApiConnectionError, isSessionExpiredError } from '@/services/roadmap-http'
import { buildChangeSummary } from '@/lib/activity-changes'
import type { Phase, ActivityChange, RoadmapConflictMetadata, SyncStatus } from '@/types/roadmap'

interface AutoSyncParams {
  serverRoadmapId: string | null
  sessionToken: string | null
  readOnly: boolean
  saved: boolean
  phases: Phase[]
  roadmapName: string
  updatedAt: string | null
  pendingActivityChanges: ActivityChange[]
  showActivity: boolean
  onSyncSuccess: (updatedAt: string) => void
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
  updatedAt,
  pendingActivityChanges,
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
  const [conflictMetadata, setConflictMetadata] = useState<RoadmapConflictMetadata | null>(null)

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref prevents concurrent autosync calls without adding isSyncing to effect deps
  const isSyncingRef = useRef(false)
  // Holds latest values so the debounced callback is never stale
  const syncParamsRef = useRef({
    phases,
    roadmapName,
    updatedAt,
    pendingActivityChanges: [] as ActivityChange[],
    serverRoadmapId,
    sessionToken,
    saved,
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
    updatedAt,
    pendingActivityChanges,
    serverRoadmapId,
    sessionToken,
    saved,
    showActivity,
    onSyncSuccess,
    onActivityRefresh,
    onToast,
    onSessionExpired,
    onConflictMetadata,
  }

  // ─── Debounced autosync for server-backed roadmaps ─────────────────────────
  useEffect(() => {
    if (!serverRoadmapId || !sessionToken || readOnly || saved) return

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)

    syncTimerRef.current = setTimeout(async () => {
      if (isSyncingRef.current) return
      isSyncingRef.current = true
      setIsSyncing(true)

      const {
        phases: p,
        roadmapName: n,
        updatedAt: ua,
        pendingActivityChanges: pac,
        serverRoadmapId: rid,
        sessionToken: tok,
        saved: currentSaved,
        showActivity: showAct,
        onSyncSuccess: syncSuccess,
        onActivityRefresh: activityRefresh,
        onToast: toast,
        onSessionExpired: sessionExpired,
        onConflictMetadata: openConflict,
      } = syncParamsRef.current

      if (!rid || !tok || currentSaved) {
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
        const data = await saveToServer(rid, n, p, tok, ua, changeSummary)
        syncSuccess(data.updated_at)
        setIsOffline(false)
        setIsConflict(false)
        setConflictMetadata(null)
        if (showAct) activityRefresh()
      } catch (err) {
        const nextConflict = getConflictMetadata(err)
        if (nextConflict || (err instanceof Error && err.message.includes('409'))) {
          setIsConflict(true)
          setConflictMetadata(nextConflict)
          if (nextConflict) openConflict?.(nextConflict)
          setIsOffline(false)
          toast('The roadmap changed elsewhere. Your edits are preserved locally.')
        } else if (isSessionExpiredError(err)) {
          sessionExpired()
        } else if (isApiConnectionError(err)) {
          setIsOffline(true)
        } else if (err instanceof Error && (err.message.includes('401') || err.message.includes('403'))) {
          setIsOffline(true)
        } else {
          setIsOffline(true)
        }
      } finally {
        isSyncingRef.current = false
        setIsSyncing(false)
      }
    }, 1500)

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  // phases/roadmapName resets the debounce; other values read from syncParamsRef to avoid stale closures
  }, [serverRoadmapId, sessionToken, readOnly, saved, phases, roadmapName])

  const syncStatus: SyncStatus = !serverRoadmapId
    ? 'local'
    : isSyncing
      ? 'syncing'
      : isConflict
        ? 'conflict'
        : isOffline
          ? 'offline'
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
