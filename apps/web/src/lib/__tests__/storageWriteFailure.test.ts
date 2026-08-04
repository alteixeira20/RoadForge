// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  STORAGE_WRITE_ERROR_EVENT,
  storage,
  type StorageWriteFailureDetail,
} from '@/lib/storage'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('storage write failure reporting', () => {
  it('reports quota failures without exposing keys or stored data', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
    })

    const failures: StorageWriteFailureDetail[] = []
    window.addEventListener(STORAGE_WRITE_ERROR_EVENT, (event) => {
      failures.push((event as CustomEvent<StorageWriteFailureDetail>).detail)
    }, { once: true })

    storage.setRoadmapCache('rm_private', {
      roadmapName: 'Secret roadmap name',
      phases: [],
      saved: false,
      ownerDisplayName: null,
      updatedAt: null,
      isPasswordEnabled: false,
    })

    expect(failures).toHaveLength(1)
    const detail = failures[0]
    expect(detail).toMatchObject({ reason: 'quota', scope: 'roadmap' })
    expect(detail.occurredAt).toEqual(expect.any(String))
    expect(JSON.stringify(detail)).not.toContain('rm_private')
    expect(JSON.stringify(detail)).not.toContain('Secret roadmap name')
  })

  it('distinguishes browser policy blocks from quota failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })

    const failures: StorageWriteFailureDetail[] = []
    window.addEventListener(STORAGE_WRITE_ERROR_EVENT, (event) => {
      failures.push((event as CustomEvent<StorageWriteFailureDetail>).detail)
    }, { once: true })

    storage.setDisplayName('Alexandre')

    expect(failures).toEqual([
      expect.objectContaining({ reason: 'blocked', scope: 'preferences' }),
    ])
  })
})
