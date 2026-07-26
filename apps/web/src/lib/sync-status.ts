import type { RealtimeConnectionStatus, SyncStatus } from '@/types/roadmap'

export type WorkspaceSyncStatus =
  | 'local'
  | 'live'
  | 'saving'
  | 'updating'
  | 'reconnecting'
  | 'offline'
  | 'access-lost'
  | 'conflict'
  | 'error'

export function resolveWorkspaceSyncStatus(
  saveStatus: SyncStatus,
  realtimeStatus: RealtimeConnectionStatus,
): WorkspaceSyncStatus {
  if (realtimeStatus === 'access-lost') return 'access-lost'
  if (saveStatus === 'conflict') return 'conflict'
  if (saveStatus === 'offline' || realtimeStatus === 'offline') return 'offline'
  if (saveStatus === 'error') return 'error'
  if (saveStatus === 'syncing') return 'saving'
  if (realtimeStatus === 'updating') return 'updating'
  if (realtimeStatus === 'connecting' || realtimeStatus === 'reconnecting') {
    return 'reconnecting'
  }
  if (saveStatus === 'local') return 'local'
  return 'live'
}
