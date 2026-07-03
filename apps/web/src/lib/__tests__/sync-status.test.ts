import { describe, expect, it } from 'vitest'
import { resolveWorkspaceSyncStatus } from '@/lib/sync-status'

describe('workspace sync status', () => {
  it('prioritizes conflict and offline states', () => {
    expect(resolveWorkspaceSyncStatus('conflict', 'offline')).toBe('conflict')
    expect(resolveWorkspaceSyncStatus('live', 'offline')).toBe('offline')
  })

  it('distinguishes saving and remote updates', () => {
    expect(resolveWorkspaceSyncStatus('syncing', 'live')).toBe('saving')
    expect(resolveWorkspaceSyncStatus('live', 'updating')).toBe('updating')
  })

  it('maps initial and retry connections to reconnecting', () => {
    expect(resolveWorkspaceSyncStatus('live', 'connecting')).toBe('reconnecting')
    expect(resolveWorkspaceSyncStatus('live', 'reconnecting')).toBe('reconnecting')
  })

  it('keeps local and live steady states distinct', () => {
    expect(resolveWorkspaceSyncStatus('local', 'local')).toBe('local')
    expect(resolveWorkspaceSyncStatus('live', 'live')).toBe('live')
  })
})
