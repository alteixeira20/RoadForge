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
    <div className={`switcher-item${active ? ' switcher-item-active' : ''}`}>
      <button
        className="switcher-item-main"
        onClick={() => onActivate(id)}
      >
        <div className="switcher-item-head">
          <span className="switcher-item-title">
            {cache.roadmapName || 'Untitled Roadmap'}
          </span>
          {auth ? (
            <span className="switcher-item-badge">
              {auth.role}
            </span>
          ) : (
            <span className="switcher-item-badge-local">
              Local
            </span>
          )}
        </div>
        <div className="switcher-item-date">
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
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  )
}
