'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { acquireLock, releaseLock } from '@/services/roadmap-locks.service'

interface UseEditLockParams {
  target: string
  active: boolean
  serverRoadmapId: string | null
  sessionToken: string | null
  /**
   * Called when tryAcquire fails.
   * `isConflict` is true when the server returns 409 (lock held by another participant).
   * `isConflict` is false for other errors.
   */
  onAcquireError?: (isConflict: boolean) => void
}

interface UseEditLockResult {
  ownsLock: boolean
  isAcquiring: boolean
  isReleasing: boolean
  tryAcquire: () => Promise<boolean>
  release: () => Promise<void>
}

/**
 * Manages acquire / refresh / release lifecycle for an edit lock.
 *
 * - Calls acquireLock when tryAcquire() is invoked.
 * - While `active` is true and a server roadmap exists, refreshes the lock
 *   every 20s (server TTL is 30s).
 * - Releases the lock when `active` goes false, on explicit release(), or
 *   on unmount. Release is no-op if the lock was never acquired in this session.
 * - When no server roadmap is configured, tryAcquire() grants ownership locally.
 */
export function useEditLock({
  target,
  active,
  serverRoadmapId,
  sessionToken,
  onAcquireError,
}: UseEditLockParams): UseEditLockResult {
  const [ownsLock, setOwnsLock] = useState(false)
  const [isAcquiring, setIsAcquiring] = useState(false)
  const [isReleasing, setIsReleasing] = useState(false)
  const ownsLockRef = useRef(false)
  const releaseRef = useRef<() => Promise<void>>(async () => {})

  const release = useCallback(async () => {
    if (!ownsLockRef.current) return

    ownsLockRef.current = false
    setOwnsLock(false)

    if (!serverRoadmapId || !sessionToken) return

    setIsReleasing(true)
    try {
      await releaseLock(serverRoadmapId, target, sessionToken)
    } catch {
      // Server TTL handles any missed cleanup
    } finally {
      setIsReleasing(false)
    }
  }, [serverRoadmapId, sessionToken, target])

  // Keep fresh so the unmount-only effect below always calls the latest version
  releaseRef.current = release

  const tryAcquire = useCallback(async (): Promise<boolean> => {
    if (!serverRoadmapId || !sessionToken) {
      ownsLockRef.current = true
      setOwnsLock(true)
      return true
    }

    setIsAcquiring(true)
    try {
      await acquireLock(serverRoadmapId, target, sessionToken)
      ownsLockRef.current = true
      setOwnsLock(true)
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      onAcquireError?.(msg.includes('409'))
      return false
    } finally {
      setIsAcquiring(false)
    }
  }, [serverRoadmapId, sessionToken, target, onAcquireError])

  // Refresh the lock every 20s while active (server TTL is 30s).
  // Release on cleanup when active goes false or on unmount.
  useEffect(() => {
    if (!active || !serverRoadmapId || !sessionToken) return

    const tryRefresh = async () => {
      try {
        await acquireLock(serverRoadmapId, target, sessionToken)
      } catch {
        // Silently fail on refresh; TTL handles expiry
      }
    }

    const interval = setInterval(tryRefresh, 20_000)

    return () => {
      clearInterval(interval)
      void release()
    }
  }, [active, serverRoadmapId, sessionToken, target, release])

  // Covers the case where active is false at unmount — the refresh effect above
  // has an early return when inactive and so sets up no cleanup of its own.
  useEffect(() => {
    return () => { void releaseRef.current() }
  }, []) // intentionally empty — runs only on unmount

  return { ownsLock, isAcquiring, isReleasing, tryAcquire, release }
}
