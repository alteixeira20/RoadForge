'use client'

import { Icon } from '@/components/ui/Icon'
import type { AuthCache, RoadmapCache } from '@/lib/storage'
import type { DeleteTarget } from './RoadmapSwitcher'

interface RoadmapSwitcherItemProps {
  id: string
  cache: RoadmapCache
  auth: AuthCache | null
  active: boolean
  onActivate: (id: string) => void
  onRequestDelete: (target: DeleteTarget) => void
}

export function RoadmapSwitcherItem({
  id,
  cache,
  auth,
  active,
  onActivate,
  onRequestDelete,
}: RoadmapSwitcherItemProps) {
  const canDeleteServer = cache.saved && auth?.role === 'owner'
  const canRemoveLocal = !canDeleteServer

  return (
    <div
      style={{
        width: '100%',
        padding: '6px 8px',
        borderRadius: 6,
        background: active ? 'var(--bg-3)' : 'transparent',
        display: 'flex',
        gap: 6,
        alignItems: 'stretch',
        boxShadow: active ? '0 0 0 1px var(--molten-dim) inset' : 'none'
      }}
    >
      <button
        onClick={() => onActivate(id)}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          cursor: 'pointer',
          padding: '2px 4px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: active ? 'var(--ember)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cache.roadmapName || 'Untitled Roadmap'}
          </span>
          {auth ? (
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-3)', background: 'var(--bg-1)', padding: '2px 6px', borderRadius: 4 }}>
              {auth.role}
            </span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--molten)', background: 'var(--molten-dim)', padding: '2px 6px', borderRadius: 4 }}>
              Local
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>
          {cache.updatedAt ? new Date(cache.updatedAt).toLocaleDateString() : 'Draft'}
        </div>
      </button>
      {(canDeleteServer || canRemoveLocal) && (
        <button
          className="iconbtn"
          title={canDeleteServer ? 'Delete roadmap' : cache.saved ? 'Remove from this browser' : 'Remove local draft'}
          aria-label={canDeleteServer ? 'Delete roadmap' : cache.saved ? 'Remove from this browser' : 'Remove local draft'}
          onClick={() => onRequestDelete({
            id,
            cache,
            auth,
            mode: canDeleteServer ? 'server' : 'local',
          })}
          style={{ color: 'var(--ember)' }}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  )
}
