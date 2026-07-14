// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { storage } from '@/lib/storage'
import type { RoadmapCache, AuthCache } from '@/lib/storage'
import type { Phase } from '@/types/roadmap'

const EMPTY_PHASES: Phase[] = []

function makeRoadmapCache(overrides: Partial<RoadmapCache> = {}): RoadmapCache {
  return {
    roadmapName: 'Test Roadmap',
    phases: EMPTY_PHASES,
    saved: false,
    ownerDisplayName: null,
    updatedAt: null,
    isPasswordEnabled: false,
    ...overrides,
  }
}

function makeAuthCache(overrides: Partial<AuthCache> = {}): AuthCache {
  return {
    serverRoadmapId: 'rm-abc123',
    sessionToken: 'tok-xyz',
    participantId: 'p-001',
    role: 'owner',
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('storage', () => {
  describe('getDisplayName / setDisplayName', () => {
    it('returns null when not set', () => {
      expect(storage.getDisplayName()).toBeNull()
    })

    it('round-trips a display name', () => {
      storage.setDisplayName('Alice')
      expect(storage.getDisplayName()).toBe('Alice')
    })
  })

  describe('getRoadmapCache / setRoadmapCache / clearRoadmapCache', () => {
    it('returns null when no cache exists', () => {
      expect(storage.getRoadmapCache('rm-none')).toBeNull()
    })

    it('round-trips a roadmap cache', () => {
      const cache = makeRoadmapCache({ roadmapName: 'My Roadmap', saved: true })
      storage.setRoadmapCache('rm-1', cache)
      expect(storage.getRoadmapCache('rm-1')).toEqual(cache)
    })

    it('clearRoadmapCache removes only roadmap source data', () => {
      const uiState = { schemaVersion: 1 as const, openPhaseIds: ['ph-1'], expandedTaskId: null, updatedAt: '' }
      storage.setRoadmapCache('rm-1', makeRoadmapCache())
      storage.setAuthCache('rm-1', makeAuthCache())
      storage.setRoadmapUiState('rm-1', uiState)
      storage.clearRoadmapCache('rm-1')
      expect(storage.getRoadmapCache('rm-1')).toBeNull()
      expect(storage.getAuthCache('rm-1')).not.toBeNull()
      expect(storage.getRoadmapUiState('rm-1')).not.toBeNull()
    })

    it('clearRoadmapStorage removes all roadmap-scoped entries', () => {
      const uiState = { schemaVersion: 1 as const, openPhaseIds: ['ph-1'], expandedTaskId: null, updatedAt: '' }
      storage.setRoadmapCache('rm-1', makeRoadmapCache())
      storage.setAuthCache('rm-1', makeAuthCache())
      storage.setRoadmapUiState('rm-1', uiState)
      storage.clearRoadmapStorage('rm-1')
      expect(storage.getRoadmapCache('rm-1')).toBeNull()
      expect(storage.getAuthCache('rm-1')).toBeNull()
      expect(storage.getRoadmapUiState('rm-1')).toBeNull()
    })
  })

  describe('getAuthCache / setAuthCache', () => {
    it('returns null when no auth cache exists', () => {
      expect(storage.getAuthCache('rm-none')).toBeNull()
    })

    it('round-trips an auth cache', () => {
      const auth = makeAuthCache({ role: 'editor' })
      storage.setAuthCache('rm-1', auth)
      expect(storage.getAuthCache('rm-1')).toEqual(auth)
    })

    it('removes auth cache when set to null', () => {
      storage.setAuthCache('rm-1', makeAuthCache())
      storage.setAuthCache('rm-1', null)
      expect(storage.getAuthCache('rm-1')).toBeNull()
    })
  })

  describe('listRoadmapCaches', () => {
    it('returns an empty array when no caches exist', () => {
      expect(storage.listRoadmapCaches()).toEqual([])
    })

    it('returns entries sorted by updatedAt descending', () => {
      const older = makeRoadmapCache({ roadmapName: 'Old', updatedAt: '2024-01-01T00:00:00Z' })
      const newer = makeRoadmapCache({ roadmapName: 'New', updatedAt: '2024-06-01T00:00:00Z' })
      storage.setRoadmapCache('rm-old', older)
      storage.setRoadmapCache('rm-new', newer)
      const list = storage.listRoadmapCaches()
      expect(list[0].id).toBe('rm-new')
      expect(list[1].id).toBe('rm-old')
    })

    it('includes auth cache alongside roadmap cache', () => {
      storage.setRoadmapCache('rm-1', makeRoadmapCache())
      storage.setAuthCache('rm-1', makeAuthCache())
      const list = storage.listRoadmapCaches()
      expect(list[0].auth).not.toBeNull()
    })

    it('sets auth to null when no auth cache exists for a roadmap', () => {
      storage.setRoadmapCache('rm-1', makeRoadmapCache())
      const list = storage.listRoadmapCaches()
      expect(list[0].auth).toBeNull()
    })
  })

  describe('removeRoadmap', () => {
    it('removes both roadmap and auth cache entries', () => {
      storage.setRoadmapCache('rm-1', makeRoadmapCache())
      storage.setAuthCache('rm-1', makeAuthCache())
      storage.removeRoadmap('rm-1')
      expect(storage.getRoadmapCache('rm-1')).toBeNull()
      expect(storage.getAuthCache('rm-1')).toBeNull()
    })

    it('clears activeRoadmapId if it matches the removed id', () => {
      storage.setRoadmapCache('rm-1', makeRoadmapCache())
      storage.setActiveRoadmapId('rm-1')
      storage.removeRoadmap('rm-1')
      expect(storage.getActiveRoadmapId()).toBeNull()
    })
  })

  describe('getRoadmapUiState / setRoadmapUiState / clearRoadmapUiState', () => {
    it('returns null when no UI state exists', () => {
      expect(storage.getRoadmapUiState('rm-none')).toBeNull()
    })

    it('round-trips a valid UI state', () => {
      const state = {
        schemaVersion: 1 as const,
        openPhaseIds: ['ph-1', 'ph-2'],
        expandedTaskId: 'task-abc',
        dismissedUpgradeNoticeSignature: 'upgrade-signature',
        updatedAt: '2025-01-01T00:00:00Z',
      }
      storage.setRoadmapUiState('rm-1', state)
      expect(storage.getRoadmapUiState('rm-1')).toEqual(state)
    })

    it('accepts old UI state without an upgrade dismissal marker', () => {
      const state = {
        schemaVersion: 1 as const,
        openPhaseIds: ['ph-1'],
        expandedTaskId: null,
        updatedAt: '2025-01-01T00:00:00Z',
      }
      window.localStorage.setItem('rf:ui:rm-1', JSON.stringify(state))
      expect(storage.getRoadmapUiState('rm-1')).toEqual(state)
    })

    it('drops non-UI fields from saved state while preserving version 1 fields', () => {
      const state = {
        schemaVersion: 1 as const,
        openPhaseIds: ['ph-1'],
        expandedTaskId: 'task-1',
        updatedAt: '2025-01-01T00:00:00Z',
        roadmapName: 'Must not be UI state',
        phases: [{ id: 'ph-1' }],
        sessionToken: 'must-not-persist',
      }

      storage.setRoadmapUiState('rm-1', state)

      expect(JSON.parse(window.localStorage.getItem('rf:ui:rm-1') ?? '')).toEqual({
        schemaVersion: 1,
        openPhaseIds: ['ph-1'],
        expandedTaskId: 'task-1',
        updatedAt: '2025-01-01T00:00:00Z',
      })
    })

    it('sanitizes extra fields from existing version 1 state', () => {
      window.localStorage.setItem('rf:ui:rm-1', JSON.stringify({
        schemaVersion: 1,
        openPhaseIds: ['ph-1'],
        expandedTaskId: null,
        updatedAt: '2025-01-01T00:00:00Z',
        roadmapName: 'Must not hydrate from UI state',
        sessionToken: 'must-not-hydrate',
      }))

      expect(storage.getRoadmapUiState('rm-1')).toEqual({
        schemaVersion: 1,
        openPhaseIds: ['ph-1'],
        expandedTaskId: null,
        updatedAt: '2025-01-01T00:00:00Z',
      })
    })

    it('persists an upgrade dismissal marker without replacing existing UI state', () => {
      const state = {
        schemaVersion: 1 as const,
        openPhaseIds: ['ph-1'],
        expandedTaskId: 'task-1',
        updatedAt: '2025-01-01T00:00:00Z',
      }
      storage.setRoadmapUiState('rm-1', state)
      storage.setDismissedUpgradeNoticeSignature('rm-1', 'upgrade-signature')

      expect(storage.getRoadmapUiState('rm-1')).toMatchObject({
        openPhaseIds: ['ph-1'],
        expandedTaskId: 'task-1',
        dismissedUpgradeNoticeSignature: 'upgrade-signature',
      })
    })

    it('returns null for unparseable data', () => {
      window.localStorage.setItem('rf:ui:rm-bad', 'not-json')
      expect(storage.getRoadmapUiState('rm-bad')).toBeNull()
    })

    it('returns null when schemaVersion does not match', () => {
      window.localStorage.setItem('rf:ui:rm-old', JSON.stringify({ schemaVersion: 99, openPhaseIds: [], expandedTaskId: null, updatedAt: '' }))
      expect(storage.getRoadmapUiState('rm-old')).toBeNull()
    })

    it('returns null when openPhaseIds is missing', () => {
      window.localStorage.setItem('rf:ui:rm-x', JSON.stringify({ schemaVersion: 1, expandedTaskId: null, updatedAt: '' }))
      expect(storage.getRoadmapUiState('rm-x')).toBeNull()
    })

    it('returns null when openPhaseIds is not an array', () => {
      window.localStorage.setItem('rf:ui:rm-x', JSON.stringify({ schemaVersion: 1, openPhaseIds: 'ph-1', expandedTaskId: null, updatedAt: '' }))
      expect(storage.getRoadmapUiState('rm-x')).toBeNull()
    })

    it('returns null when openPhaseIds contains a non-string', () => {
      window.localStorage.setItem('rf:ui:rm-x', JSON.stringify({ schemaVersion: 1, openPhaseIds: [1, 'ph-2'], expandedTaskId: null, updatedAt: '' }))
      expect(storage.getRoadmapUiState('rm-x')).toBeNull()
    })

    it('returns null when expandedTaskId is not a string or null', () => {
      window.localStorage.setItem('rf:ui:rm-x', JSON.stringify({ schemaVersion: 1, openPhaseIds: [], expandedTaskId: 42, updatedAt: '' }))
      expect(storage.getRoadmapUiState('rm-x')).toBeNull()
    })

    it('returns null when updatedAt is not a string', () => {
      window.localStorage.setItem('rf:ui:rm-x', JSON.stringify({ schemaVersion: 1, openPhaseIds: [], expandedTaskId: null, updatedAt: null }))
      expect(storage.getRoadmapUiState('rm-x')).toBeNull()
    })

    it('returns null when the upgrade dismissal marker is not a string', () => {
      window.localStorage.setItem('rf:ui:rm-x', JSON.stringify({
        schemaVersion: 1,
        openPhaseIds: [],
        expandedTaskId: null,
        dismissedUpgradeNoticeSignature: 42,
        updatedAt: '',
      }))
      expect(storage.getRoadmapUiState('rm-x')).toBeNull()
    })

    it('accepts a string expandedTaskId', () => {
      const state = { schemaVersion: 1 as const, openPhaseIds: [], expandedTaskId: 'task-1', updatedAt: '2025-01-01T00:00:00Z' }
      storage.setRoadmapUiState('rm-1', state)
      expect(storage.getRoadmapUiState('rm-1')).toEqual(state)
    })

    it('clearRoadmapUiState removes the entry', () => {
      const state = { schemaVersion: 1 as const, openPhaseIds: [], expandedTaskId: null, updatedAt: '' }
      storage.setRoadmapUiState('rm-1', state)
      storage.clearRoadmapUiState('rm-1')
      expect(storage.getRoadmapUiState('rm-1')).toBeNull()
    })

    it('uses a key separate from roadmap and auth caches', () => {
      const state = { schemaVersion: 1 as const, openPhaseIds: ['ph-x'], expandedTaskId: null, updatedAt: '' }
      storage.setRoadmapUiState('rm-1', state)
      expect(window.localStorage.getItem('rf:ui:rm-1')).not.toBeNull()
      expect(window.localStorage.getItem('rf:roadmap:rm-1')).toBeNull()
    })

    it('accepts UI state with isOnboardingDismissed', () => {
      const state = {
        schemaVersion: 1 as const,
        openPhaseIds: [],
        expandedTaskId: null,
        isOnboardingDismissed: true,
        updatedAt: '2025-01-01T00:00:00Z',
      }
      storage.setRoadmapUiState('rm-1', state)
      expect(storage.getRoadmapUiState('rm-1')).toEqual(state)
    })

    it('returns null when isOnboardingDismissed is not a boolean', () => {
      window.localStorage.setItem('rf:ui:rm-x', JSON.stringify({
        schemaVersion: 1,
        openPhaseIds: [],
        expandedTaskId: null,
        isOnboardingDismissed: 'not-a-boolean',
        updatedAt: '',
      }))
      expect(storage.getRoadmapUiState('rm-x')).toBeNull()
    })
  })

  describe('onboarding dismissal', () => {
    it('hasDismissedOnboarding returns false when no UI state has dismissed onboarding', () => {
      expect(storage.hasDismissedOnboarding()).toBe(false)

      const state = {
        schemaVersion: 1 as const,
        openPhaseIds: [],
        expandedTaskId: null,
        isOnboardingDismissed: false,
        updatedAt: '2025-01-01T00:00:00Z',
      }
      storage.setRoadmapUiState('rm-1', state)
      expect(storage.hasDismissedOnboarding()).toBe(false)
    })

    it('hasDismissedOnboarding returns true if any UI state has isOnboardingDismissed === true', () => {
      const state1 = {
        schemaVersion: 1 as const,
        openPhaseIds: [],
        expandedTaskId: null,
        isOnboardingDismissed: false,
        updatedAt: '2025-01-01T00:00:00Z',
      }
      const state2 = {
        schemaVersion: 1 as const,
        openPhaseIds: [],
        expandedTaskId: null,
        isOnboardingDismissed: true,
        updatedAt: '2025-01-01T00:00:00Z',
      }
      storage.setRoadmapUiState('rm-1', state1)
      storage.setRoadmapUiState('rm-2', state2)
      expect(storage.hasDismissedOnboarding()).toBe(true)
    })

    it('setOnboardingDismissed sets and persists onboarding dismissal', () => {
      storage.setOnboardingDismissed('rm-1', true)
      expect(storage.getRoadmapUiState('rm-1')?.isOnboardingDismissed).toBe(true)
      expect(storage.hasDismissedOnboarding()).toBe(true)
    })
  })

  describe('setActiveRoadmapId / getActiveRoadmapId', () => {
    it('returns null when not set', () => {
      expect(storage.getActiveRoadmapId()).toBeNull()
    })

    it('round-trips an active roadmap id via sessionStorage', () => {
      storage.setActiveRoadmapId('rm-session')
      expect(storage.getActiveRoadmapId()).toBe('rm-session')
      // Confirm it is in sessionStorage, not localStorage
      expect(window.sessionStorage.getItem('rf:activeRoadmapId')).toBe('rm-session')
      expect(window.localStorage.getItem('rf:activeRoadmapId')).toBeNull()
    })

    it('clears active roadmap id when set to null', () => {
      storage.setActiveRoadmapId('rm-1')
      storage.setActiveRoadmapId(null)
      expect(storage.getActiveRoadmapId()).toBeNull()
    })
  })
})
