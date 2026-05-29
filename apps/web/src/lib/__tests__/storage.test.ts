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
  describe('getTheme / setTheme', () => {
    it('returns null when no theme is set', () => {
      expect(storage.getTheme()).toBeNull()
    })

    it('round-trips dark theme', () => {
      storage.setTheme('dark')
      expect(storage.getTheme()).toBe('dark')
    })

    it('round-trips light theme', () => {
      storage.setTheme('light')
      expect(storage.getTheme()).toBe('light')
    })
  })

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

    it('clearRoadmapCache removes the roadmap, auth, and UI state entries', () => {
      const uiState = { schemaVersion: 1 as const, openPhaseIds: ['ph-1'], expandedTaskId: null, updatedAt: '' }
      storage.setRoadmapCache('rm-1', makeRoadmapCache())
      storage.setAuthCache('rm-1', makeAuthCache())
      storage.setRoadmapUiState('rm-1', uiState)
      storage.clearRoadmapCache('rm-1')
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
        updatedAt: '2025-01-01T00:00:00Z',
      }
      storage.setRoadmapUiState('rm-1', state)
      expect(storage.getRoadmapUiState('rm-1')).toEqual(state)
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
