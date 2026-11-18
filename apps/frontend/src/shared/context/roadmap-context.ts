'use client'

import { createContext, useContext } from 'react'
import type { Phase, RealtimeConnectionStatus, ShareRole, TagDefinition } from '@/shared/types/roadmap'

export interface RoadmapDataContextValue {
  displayName: string
  setDisplayName: (name: string) => void
  roadmapName: string
  setRoadmapName: (name: string) => void
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  saved: boolean
  setSaved: (saved: boolean) => void
  isPasswordEnabled: boolean
  setIsPasswordEnabled: (value: boolean) => void
  ownerDisplayName: string | null
  setOwnerDisplayName: (value: string | null) => void
  updatedAt: string | null
  setUpdatedAt: (value: string | null) => void
  tagRegistry: TagDefinition[]
  setTagRegistry: (registry: TagDefinition[]) => void
  isSample: boolean
  setIsSample: (value: boolean) => void
  registerDirtyDraft?: (taskId: string, dirty: boolean) => void
  dirtyDraftCount?: number
}

export interface RoadmapSessionContextValue {
  serverRoadmapId: string | null
  setServerRoadmapId: (id: string | null) => void
  sessionToken: string | null
  setSessionToken: (value: string | null) => void
  participantId: string | null
  setParticipantId: (value: string | null) => void
  role: ShareRole | null
  setRole: (value: ShareRole | null) => void
  locks: Record<string, { participantId: string; displayName: string }>
}

export interface RoadmapLifecycleContextValue {
  activeRoadmapId: string | null
  activateRoadmap: (id: string) => void
  createLocalRoadmap: (
    name: string,
    phases: Phase[],
    tagRegistry?: TagDefinition[],
  ) => string
  resetToSample: () => void
  removeRoadmapFromBrowser: (id: string) => void
  accessRevokedEvent: 'revoked' | 'deleted' | 'expired' | null
  clearAccessRevokedEvent: () => void
  sessionExpiredRoadmapId: string | null
  clearSessionExpiredNotice: () => void
  realtimeStatus: RealtimeConnectionStatus
}

export const RoadmapDataContext = createContext<RoadmapDataContextValue | null>(null)
export const RoadmapSessionContext = createContext<RoadmapSessionContextValue | null>(null)
export const RoadmapLifecycleContext = createContext<RoadmapLifecycleContextValue | null>(null)

// ─── Focused hooks (use these for precise subscriptions) ─────────────────────

export function useRoadmapData(): RoadmapDataContextValue {
  const ctx = useContext(RoadmapDataContext)
  if (!ctx) throw new Error('useRoadmapData must be used inside <RoadmapProvider>')
  return ctx
}

export function useRoadmapSession(): RoadmapSessionContextValue {
  const ctx = useContext(RoadmapSessionContext)
  if (!ctx) throw new Error('useRoadmapSession must be used inside <RoadmapProvider>')
  return ctx
}

export function useRoadmapLifecycle(): RoadmapLifecycleContextValue {
  const ctx = useContext(RoadmapLifecycleContext)
  if (!ctx) throw new Error('useRoadmapLifecycle must be used inside <RoadmapProvider>')
  return ctx
}
