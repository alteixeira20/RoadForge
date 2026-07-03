import type { RealtimeConnectionStatus, SyncStatus } from '@/types/roadmap'

export type WorkspaceSyncStatus =
  | 'local'
  | 'live'
  | 'saving'
  | 'updating'
  | 'reconnecting'
  | 'offline'
  | 'conflict'

export function resolveWorkspaceSyncStatus(
  saveStatus: SyncStatus,
  realtimeStatus: RealtimeConnectionStatus,
): WorkspaceSyncStatus {
  if (saveStatus === 'conflict') return 'conflict'
  if (saveStatus === 'offline' || realtimeStatus === 'offline') return 'offline'
  if (saveStatus === 'syncing') return 'saving'
  if (realtimeStatus === 'updating') return 'updating'
  if (realtimeStatus === 'connecting' || realtimeStatus === 'reconnecting') {
    return 'reconnecting'
  }
  if (saveStatus === 'local') return 'local'
  return 'live'
}
