'use client'

import { useCallback, useRef } from 'react'
import {
  isNewerServerRevision,
  isOlderServerRevision,
  newestServerRevision,
} from '@/lib/server-revision'
import { storage } from '@/lib/storage'
import {
  registerPendingTaskCreation,
  unregisterPendingTaskCreation,
} from '@/lib/task-creation-readiness'
import type { Phase } from '@/types/roadmap'

export type TaskServerReadiness = 'ready' | 'absent' | 'uncertain'

export interface TaskCreationBarrier {
  promise: Promise<TaskServerReadiness>
  resolve: (readiness: TaskServerReadiness) => void
}

interface UseTaskStructureSyncStateParams {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  updatedAt: string | null
  setUpdatedAt: (updatedAt: string) => void
}

function cachedRoadmap() {
  const activeId = storage.getActiveRoadmapId()
  if (!activeId) return null
  return storage.getRoadmapCache(activeId)
}

function cachedServerRevision(): string | null {
  return cachedRoadmap()?.updatedAt ?? null
}

function createBarrier(): TaskCreationBarrier {
  let resolve!: (readiness: TaskServerReadiness) => void
  const promise = new Promise<TaskServerReadiness>((next) => { resolve = next })
  return { promise, resolve }
}

export function useTaskStructureSyncState({
  phases,
  setPhases,
  updatedAt,
  setUpdatedAt,
}: UseTaskStructureSyncStateParams) {
  const phasesRef = useRef(phases)
  const latestRevisionRef = useRef<string | null>(updatedAt)
  const generationsRef = useRef<Map<string, number>>(new Map())
  const creationBarriersRef = useRef<Map<string, TaskCreationBarrier>>(new Map())

  phasesRef.current = phases
  if (updatedAt && isNewerServerRevision(updatedAt, latestRevisionRef.current)) {
    latestRevisionRef.current = updatedAt
  }

  const setCurrentPhases = useCallback((nextPhases: Phase[]) => {
    phasesRef.current = nextPhases
    setPhases(nextPhases)
  }, [setPhases])

  const nextGeneration = useCallback((scope: string) => {
    const next = (generationsRef.current.get(scope) ?? 0) + 1
    generationsRef.current.set(scope, next)
    return next
  }, [])

  const ownsGeneration = useCallback((scope: string, generation: number) => (
    generationsRef.current.get(scope) === generation
  ), [])

  const responseIsStale = useCallback((candidate: string): boolean => {
    const current = newestServerRevision(latestRevisionRef.current, cachedServerRevision())
    return isOlderServerRevision(candidate, current)
  }, [])

  const advanceUpdatedAt = useCallback((candidate: string) => {
    const current = newestServerRevision(latestRevisionRef.current, cachedServerRevision())
    if (isOlderServerRevision(candidate, current)) return
    if (!isNewerServerRevision(candidate, latestRevisionRef.current)) return
    latestRevisionRef.current = candidate
    setUpdatedAt(candidate)
  }, [setUpdatedAt])

  const waitForTaskReady = useCallback((taskId: string): Promise<TaskServerReadiness> => (
    creationBarriersRef.current.get(taskId)?.promise ?? Promise.resolve('ready')
  ), [])

  const beginTaskCreation = useCallback((taskId: string) => {
    const barrier = createBarrier()
    creationBarriersRef.current.set(taskId, barrier)
    registerPendingTaskCreation(taskId, barrier.promise)
    return {
      barrier,
      startedAtRevision: newestServerRevision(
        latestRevisionRef.current,
        cachedServerRevision(),
      ),
    }
  }, [])

  const finishTaskCreation = useCallback((
    taskId: string,
    barrier: TaskCreationBarrier,
    readiness: TaskServerReadiness,
  ) => {
    barrier.resolve(readiness)
    unregisterPendingTaskCreation(taskId, barrier.promise)
    if (creationBarriersRef.current.get(taskId) === barrier) {
      creationBarriersRef.current.delete(taskId)
    }
  }, [])

  return {
    phasesRef,
    setCurrentPhases,
    nextGeneration,
    ownsGeneration,
    responseIsStale,
    advanceUpdatedAt,
    waitForTaskReady,
    beginTaskCreation,
    finishTaskCreation,
    cachedRoadmap,
  }
}
