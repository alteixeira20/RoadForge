import type { Phase, ShareRole, TagDefinition, Theme } from '@/types/roadmap'

const KEYS = {
  theme: 'rf:theme',
  displayName: 'rf:displayName',
  lastRoadmapId: 'rf:lastRoadmapId',
  activeRoadmapId: 'rf:activeRoadmapId',
} as const

const LEGACY_KEYS = {
  roadmapName: 'rf:roadmapName',
  phases: 'rf:phases',
  saved: 'rf:saved',
  isPasswordEnabled: 'rf:isPasswordEnabled',
  serverRoadmapId: 'rf:serverRoadmapId',
  sessionToken: 'rf:sessionToken',
  participantId: 'rf:participantId',
  role: 'rf:role',
  ownerDisplayName: 'rf:ownerDisplayName',
  updatedAt: 'rf:updatedAt',
} as const

export interface RoadmapCache {
  roadmapName: string
  phases: Phase[]
  saved: boolean
  ownerDisplayName: string | null
  updatedAt: string | null
  isPasswordEnabled: boolean
  tagRegistry?: TagDefinition[]
  isSample?: boolean
}

export interface AuthCache {
  serverRoadmapId: string
  sessionToken: string
  participantId: string | null
  role: ShareRole
}

export interface RoadmapUiState {
  schemaVersion: 1
  openPhaseIds: string[]
  expandedTaskId: string | null
  dismissedUpgradeNoticeSignature?: string
  isOnboardingDismissed?: boolean
  updatedAt: string
}

function parseRoadmapUiState(value: unknown): RoadmapUiState | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (v.schemaVersion !== 1) return null
  if (!Array.isArray(v.openPhaseIds)) return null
  if (!(v.openPhaseIds as unknown[]).every((id) => typeof id === 'string')) return null
  if (v.expandedTaskId !== null && typeof v.expandedTaskId !== 'string') return null
  if (
    v.dismissedUpgradeNoticeSignature !== undefined &&
    typeof v.dismissedUpgradeNoticeSignature !== 'string'
  ) return null
  if (v.isOnboardingDismissed !== undefined && typeof v.isOnboardingDismissed !== 'boolean') return null
  if (typeof v.updatedAt !== 'string') return null

  const state: RoadmapUiState = {
    schemaVersion: 1,
    openPhaseIds: v.openPhaseIds as string[],
    expandedTaskId: v.expandedTaskId as string | null,
    updatedAt: v.updatedAt,
  }
  if (typeof v.dismissedUpgradeNoticeSignature === 'string') {
    state.dismissedUpgradeNoticeSignature = v.dismissedUpgradeNoticeSignature
  }
  if (typeof v.isOnboardingDismissed === 'boolean') {
    state.isOnboardingDismissed = v.isOnboardingDismissed
  }
  return state
}

function getLocal(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function setLocal(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // storage full or blocked — silently ignore
  }
}

function removeLocal(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function removeSession(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function getSession(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function setSession(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(key, value)
  } catch {}
}

export const storage = {
  getTheme(): Theme | null {
    const v = getLocal(KEYS.theme)
    return v === 'dark' || v === 'light' ? v : null
  },
  setTheme(theme: Theme): void {
    setLocal(KEYS.theme, theme)
  },

  getDisplayName(): string | null {
    return getLocal(KEYS.displayName)
  },
  setDisplayName(name: string): void {
    setLocal(KEYS.displayName, name)
  },

  getLastRoadmapId(): string | null {
    return getLocal(KEYS.lastRoadmapId)
  },
  setLastRoadmapId(id: string | null): void {
    if (!id) removeLocal(KEYS.lastRoadmapId)
    else setLocal(KEYS.lastRoadmapId, id)
  },

  getActiveRoadmapId(): string | null {
    return getSession(KEYS.activeRoadmapId)
  },
  setActiveRoadmapId(id: string | null): void {
    if (!id) {
      removeSession(KEYS.activeRoadmapId)
    } else {
      setSession(KEYS.activeRoadmapId, id)
    }
  },

  createLocalDraftId(): string {
    return `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  },

  getRoadmapCache(id: string): RoadmapCache | null {
    const raw = getLocal(`rf:roadmap:${id}`)
    if (!raw) return null
    try {
      return JSON.parse(raw) as RoadmapCache
    } catch {
      return null
    }
  },
  setRoadmapCache(id: string, cache: RoadmapCache): void {
    setLocal(`rf:roadmap:${id}`, JSON.stringify(cache))
  },
  
  getAuthCache(id: string): AuthCache | null {
    const raw = getLocal(`rf:auth:${id}`)
    if (!raw) return null
    try {
      return JSON.parse(raw) as AuthCache
    } catch {
      return null
    }
  },
  setAuthCache(id: string, auth: AuthCache | null): void {
    if (!auth) removeLocal(`rf:auth:${id}`)
    else setLocal(`rf:auth:${id}`, JSON.stringify(auth))
  },

  clearRoadmapCache(id: string): void {
    removeLocal(`rf:roadmap:${id}`)
  },

  clearRoadmapStorage(id: string): void {
    this.clearRoadmapCache(id)
    removeLocal(`rf:auth:${id}`)
    removeLocal(`rf:ui:${id}`)
  },

  removeRoadmap(id: string): void {
    this.clearRoadmapStorage(id)
    if (this.getActiveRoadmapId() === id) this.setActiveRoadmapId(null)
    if (this.getLastRoadmapId() === id) {
      const next = this.listRoadmapCaches()[0]?.id ?? null
      this.setLastRoadmapId(next)
    }
  },

  listRoadmapCaches(): Array<{ id: string; cache: RoadmapCache; auth: AuthCache | null }> {
    if (typeof window === 'undefined') return []
    const results: Array<{ id: string; cache: RoadmapCache; auth: AuthCache | null }> = []
    
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith('rf:roadmap:')) {
        const id = key.substring('rf:roadmap:'.length)
        const cache = this.getRoadmapCache(id)
        if (cache) {
          const auth = this.getAuthCache(id)
          results.push({ id, cache, auth })
        }
      }
    }
    
    return results.sort((a, b) => {
      const aTime = a.cache.updatedAt ? new Date(a.cache.updatedAt).getTime() : 0
      const bTime = b.cache.updatedAt ? new Date(b.cache.updatedAt).getTime() : 0
      return bTime - aTime
    })
  },

  getRoadmapUiState(id: string): RoadmapUiState | null {
    const raw = getLocal(`rf:ui:${id}`)
    if (!raw) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      return parseRoadmapUiState(parsed)
    } catch {
      return null
    }
  },
  setRoadmapUiState(id: string, state: RoadmapUiState): void {
    const parsed = parseRoadmapUiState(state)
    if (parsed) setLocal(`rf:ui:${id}`, JSON.stringify(parsed))
  },
  setDismissedUpgradeNoticeSignature(id: string, signature: string): void {
    const current = this.getRoadmapUiState(id) ?? {
      schemaVersion: 1,
      openPhaseIds: [],
      expandedTaskId: null,
      updatedAt: new Date().toISOString(),
    }
    this.setRoadmapUiState(id, {
      ...current,
      dismissedUpgradeNoticeSignature: signature,
      updatedAt: new Date().toISOString(),
    })
  },
  clearRoadmapUiState(id: string): void {
    removeLocal(`rf:ui:${id}`)
  },

  hasDismissedOnboarding(): boolean {
    if (typeof window === 'undefined') return false
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith('rf:ui:')) {
        const raw = getLocal(key)
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>
            if (parsed.isOnboardingDismissed === true) {
              return true
            }
          } catch {}
        }
      }
    }
    return false
  },

  setOnboardingDismissed(id: string, dismissed: boolean): void {
    const current = this.getRoadmapUiState(id) ?? {
      schemaVersion: 1,
      openPhaseIds: [],
      expandedTaskId: null,
      updatedAt: new Date().toISOString(),
    }
    this.setRoadmapUiState(id, {
      ...current,
      isOnboardingDismissed: dismissed,
      updatedAt: new Date().toISOString(),
    })
  },

  migrateLegacyStorageIfNeeded(): string | null {
    const serverRoadmapId = getLocal(LEGACY_KEYS.serverRoadmapId)
    const rawPhases = getLocal(LEGACY_KEYS.phases)
    
    if (!serverRoadmapId && !rawPhases) {
      return null // nothing to migrate
    }

    let phases: Phase[] = []
    try {
      phases = rawPhases ? JSON.parse(rawPhases) : []
    } catch {}

    const roadmapName = getLocal(LEGACY_KEYS.roadmapName) || 'v1.0 Public Launch'
    const saved = getLocal(LEGACY_KEYS.saved) === 'true'
    const ownerDisplayName = getLocal(LEGACY_KEYS.ownerDisplayName)
    const updatedAt = getLocal(LEGACY_KEYS.updatedAt)
    const isPasswordEnabled = getLocal(LEGACY_KEYS.isPasswordEnabled) === 'true'

    const newId = serverRoadmapId || this.createLocalDraftId()

    const roadmapCache: RoadmapCache = {
      roadmapName,
      phases,
      saved,
      ownerDisplayName,
      updatedAt,
      isPasswordEnabled
    }
    this.setRoadmapCache(newId, roadmapCache)

    if (serverRoadmapId) {
      const sessionToken = getLocal(LEGACY_KEYS.sessionToken)
      const participantId = getLocal(LEGACY_KEYS.participantId)
      const roleRaw = getLocal(LEGACY_KEYS.role)
      const role: ShareRole = roleRaw === 'owner' || roleRaw === 'editor' || roleRaw === 'viewer' ? roleRaw : 'viewer'

      if (sessionToken) {
        const authCache: AuthCache = {
          serverRoadmapId,
          sessionToken,
          participantId,
          role
        }
        this.setAuthCache(serverRoadmapId, authCache)
      }
    }

    this.setActiveRoadmapId(newId)
    this.setLastRoadmapId(newId)

    // Clear legacy keys
    Object.values(LEGACY_KEYS).forEach(removeLocal)

    return newId
  }
}
