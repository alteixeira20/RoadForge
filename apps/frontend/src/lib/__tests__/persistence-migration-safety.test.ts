// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  storage,
  STORAGE_WRITE_ERROR_EVENT,
  type StorageWriteFailureDetail,
} from '@/lib/storage'
import type { Phase } from '@/types/roadmap'

const samplePhases: Phase[] = [
  {
    id: 'ph-1',
    num: '01',
    name: 'Foundation',
    color: '#3b82f6',
    colorMode: 'auto',
    status: 'active',
    progress: 0,
    tasks: [],
  },
]

describe('persistence migration safety and quota exhaustion', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('failed localStorage writes during migration', () => {
    it('preserves legacy keys when roadmap cache write fails', () => {
      window.localStorage.setItem('rf:serverRoadmapId', 'rm-legacy-1')
      window.localStorage.setItem('rf:roadmapName', 'Legacy Roadmap')
      window.localStorage.setItem('rf:phases', JSON.stringify(samplePhases))
      window.localStorage.setItem('rf:sessionToken', 'legacy-tok-123')
      window.localStorage.setItem('rf:participantId', 'p-legacy')
      window.localStorage.setItem('rf:role', 'owner')
      window.localStorage.setItem('rf:saved', 'true')
      window.localStorage.setItem('rf:updatedAt', '2026-07-25T16:00:00Z')

      const originalSetItem = Storage.prototype.setItem
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
        if (key.startsWith('rf:roadmap:')) {
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
        }
        return originalSetItem.call(this, key, value)
      })

      const failures: StorageWriteFailureDetail[] = []
      window.addEventListener(STORAGE_WRITE_ERROR_EVENT, (e) => {
        failures.push((e as CustomEvent<StorageWriteFailureDetail>).detail)
      })

      const result = storage.migrateLegacyStorageIfNeeded()

      expect(result).toBeNull()
      expect(failures.length).toBeGreaterThan(0)
      expect(failures[0].reason).toBe('quota')

      // Crucial: legacy keys must NOT have been deleted
      expect(window.localStorage.getItem('rf:serverRoadmapId')).toBe('rm-legacy-1')
      expect(window.localStorage.getItem('rf:roadmapName')).toBe('Legacy Roadmap')
      expect(window.localStorage.getItem('rf:phases')).toBe(JSON.stringify(samplePhases))
      expect(window.localStorage.getItem('rf:sessionToken')).toBe('legacy-tok-123')
      expect(window.localStorage.getItem('rf:participantId')).toBe('p-legacy')
    })

    it('preserves legacy credentials when auth cache write fails', () => {
      window.localStorage.setItem('rf:serverRoadmapId', 'rm-legacy-2')
      window.localStorage.setItem('rf:roadmapName', 'Secured Roadmap')
      window.localStorage.setItem('rf:phases', JSON.stringify(samplePhases))
      window.localStorage.setItem('rf:sessionToken', 'secret-session-token')
      window.localStorage.setItem('rf:role', 'editor')

      const originalSetItem = Storage.prototype.setItem
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
        if (key.startsWith('rf:auth:')) {
          throw new DOMException('Access denied', 'SecurityError')
        }
        return originalSetItem.call(this, key, value)
      })

      const result = storage.migrateLegacyStorageIfNeeded()

      expect(result).toBeNull()

      // Legacy auth keys must remain intact
      expect(window.localStorage.getItem('rf:serverRoadmapId')).toBe('rm-legacy-2')
      expect(window.localStorage.getItem('rf:sessionToken')).toBe('secret-session-token')
      expect(window.localStorage.getItem('rf:role')).toBe('editor')
      expect(window.localStorage.getItem('rf:phases')).toBe(JSON.stringify(samplePhases))
    })

    it('clears legacy keys only after successful write and verified readback', () => {
      window.localStorage.setItem('rf:serverRoadmapId', 'rm-legacy-3')
      window.localStorage.setItem('rf:roadmapName', 'Successful Migration')
      window.localStorage.setItem('rf:phases', JSON.stringify(samplePhases))
      window.localStorage.setItem('rf:sessionToken', 'auth-tok-ok')
      window.localStorage.setItem('rf:role', 'owner')
      window.localStorage.setItem('rf:saved', 'true')

      const migratedId = storage.migrateLegacyStorageIfNeeded()

      expect(migratedId).toBe('rm-legacy-3')

      // Confirmed migrated data can be read
      const cached = storage.getRoadmapCache('rm-legacy-3')
      expect(cached).not.toBeNull()
      expect(cached?.roadmapName).toBe('Successful Migration')
      expect(cached?.phases).toEqual(samplePhases)

      const auth = storage.getAuthCache('rm-legacy-3')
      expect(auth).not.toBeNull()
      expect(auth?.sessionToken).toBe('auth-tok-ok')

      // Legacy keys are safely removed
      expect(window.localStorage.getItem('rf:serverRoadmapId')).toBeNull()
      expect(window.localStorage.getItem('rf:phases')).toBeNull()
      expect(window.localStorage.getItem('rf:sessionToken')).toBeNull()
      expect(window.localStorage.getItem('rf:roadmapName')).toBeNull()
    })
  })

  describe('browser storage quota exhaustion', () => {
    it('returns false and preserves existing readable data when write exceeds quota', () => {
      // First write succeeds
      const initialCache = {
        roadmapName: 'Existing Work',
        phases: samplePhases,
        saved: true,
        ownerDisplayName: 'Alice',
        updatedAt: '2026-07-25T16:00:00Z',
        isPasswordEnabled: false,
      }
      const success = storage.setRoadmapCache('rm-quota', initialCache)
      expect(success).toBe(true)
      expect(storage.getRoadmapCache('rm-quota')).toEqual(initialCache)

      // Subsequent write throws QuotaExceededError
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      })

      const failures: StorageWriteFailureDetail[] = []
      window.addEventListener(STORAGE_WRITE_ERROR_EVENT, (e) => {
        failures.push((e as CustomEvent<StorageWriteFailureDetail>).detail)
      }, { once: true })

      const updatedCache = {
        ...initialCache,
        roadmapName: 'Large new edit that overflows quota',
      }
      const writeResult = storage.setRoadmapCache('rm-quota', updatedCache)

      expect(writeResult).toBe(false)
      expect(failures).toHaveLength(1)
      expect(failures[0].reason).toBe('quota')
      expect(failures[0].scope).toBe('roadmap')

      // Existing readable data must be preserved intact
      vi.restoreAllMocks()
      expect(storage.getRoadmapCache('rm-quota')).toEqual(initialCache)
    })
  })
})
