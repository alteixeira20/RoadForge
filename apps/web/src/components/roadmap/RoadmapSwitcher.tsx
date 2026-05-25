'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { useRoadmap } from '@/context/RoadmapContext'
import { storage, type AuthCache, type RoadmapCache } from '@/lib/storage'
import { persistJoinResult } from '@/lib/join-flow'
import { deleteRoadmap, getRoadmap, isApiConnectionError, joinRoadmap } from '@/services/roadmap.service'
import { Modal } from '@/components/ui/Modal'
import type { ShareRole } from '@/types/roadmap'

interface RoadmapSwitcherProps {
  variant?: 'header' | 'compact' | 'workspace'
  hideWhenEmpty?: boolean
  label?: string
  onCreate?: () => void
}

interface DeleteTarget {
  id: string
  cache: RoadmapCache
  auth: AuthCache | null
  mode: 'server' | 'local'
}

export function RoadmapSwitcher({
  variant = 'workspace',
  hideWhenEmpty = false,
  label = 'Roadmaps and session',
  onCreate,
}: RoadmapSwitcherProps) {
  const router = useRouter()
  const {
    displayName,
    activeRoadmapId,
    activateRoadmap,
    removeRoadmapFromBrowser,
  } = useRoadmap()

  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)
  
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowAddForm(false)
        setError(null)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [isOpen])

  const caches = mounted ? storage.listRoadmapCaches() : []
  const visibleCaches = caches

  if (!mounted && hideWhenEmpty) return null
  if (hideWhenEmpty && visibleCaches.length === 0) return null

  const getRoadmapPath = (id: string, role?: ShareRole | null) => {
    const path = role === 'viewer' ? '/shared' : '/workspace'
    return `${path}?roadmap=${encodeURIComponent(id)}`
  }

  const handleCreateNew = () => {
    setIsOpen(false)
    if (onCreate) {
      onCreate()
      return
    }
    router.push('/?create=1')
  }

  const handleActivateRoadmap = (id: string) => {
    const auth = storage.getAuthCache(id)
    activateRoadmap(id)
    setIsOpen(false)
    router.push(getRoadmapPath(id, auth?.role))
  }

  const handleJoin = async () => {
    if (!inviteLink.trim() || joining) return
    setJoining(true)
    setError(null)
    
    try {
      let token = inviteLink.trim()
      try {
        const url = new URL(token)
        token = url.searchParams.get('token') || token
      } catch {
        // Not a URL, try as raw token
      }

      const { roadmapId, roadmapName, role, sessionToken, participantId } = await joinRoadmap(
        token,
        displayName.trim() || undefined,
        password || undefined,
      )

      persistJoinResult({ roadmapId, roadmapName, role: role as ShareRole, sessionToken, participantId })

      try {
        const roadmap = await getRoadmap(roadmapId, sessionToken)
        storage.setRoadmapCache(roadmapId, {
          roadmapName: roadmap.roadmap.name,
          phases: roadmap.phases,
          saved: true,
          ownerDisplayName: roadmap.ownerDisplayName,
          updatedAt: roadmap.updatedAt,
          isPasswordEnabled: !!roadmap.roadmap.isPasswordEnabled,
        })
      } catch {
        // Continue even if initial fetch fails
      }

      activateRoadmap(roadmapId)
      setIsOpen(false)
      setShowAddForm(false)
      setInviteLink('')
      setPassword('')
      setNeedsPassword(false)
      router.push(getRoadmapPath(roadmapId, role as ShareRole))
      
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('password')) {
        setNeedsPassword(true)
        setError('Password required.')
      } else if (msg.includes('401') || msg.includes('Invalid')) {
        setError('Invalid or expired invite link.')
      } else if (msg.includes('403')) {
        setError('Incorrect password.')
      } else {
        setError('Could not join — check connection.')
      }
    } finally {
      setJoining(false)
    }
  }

  const handleRequestDelete = (target: DeleteTarget) => {
    setDeleteTarget(target)
    setError(null)
    setIsOpen(false)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setError(null)

    try {
      if (deleteTarget.mode === 'server') {
        if (!deleteTarget.auth?.sessionToken) {
          setError('Missing owner session for this roadmap.')
          return
        }
        await deleteRoadmap(deleteTarget.auth.serverRoadmapId, deleteTarget.auth.sessionToken)
      }

      removeRoadmapFromBrowser(deleteTarget.id)
      setDeleteTarget(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('404')) {
        removeRoadmapFromBrowser(deleteTarget.id)
        setDeleteTarget(null)
      } else if (msg.includes('403')) {
        setError('Only the owner can delete this roadmap.')
      } else if (isApiConnectionError(err)) {
        setError('RoadForge API is not reachable. Start the backend with make start.')
      } else {
        setError('Could not delete roadmap.')
      }
    } finally {
      setDeleting(false)
    }
  }

  const isWorkspaceVariant = variant === 'workspace'

  return (
    <div className={`roadmap-switcher ${variant}`} ref={menuRef} style={{ position: 'relative' }}>
      <button 
        className={isWorkspaceVariant ? 'roadmap-menu-trigger' : 'iconbtn'}
        title={label}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={label}
        aria-expanded={isOpen}
      >
        {isWorkspaceVariant ? (
          <>
            <Icon name="user" size={16} />
            <Icon name="chevron-down" size={12} />
          </>
        ) : (
          <Icon name="device" size={16} />
        )}
      </button>

      {isOpen && (
        <div className="switcher-dropdown" style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: 320,
          background: 'var(--bg-2)',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          boxShadow: 'var(--shadow-lg)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Your roadmaps</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Stored on this browser</div>
          </div>
          
          <div style={{ maxHeight: 300, overflowY: 'auto', padding: 8 }}>
            {visibleCaches.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>
                No stored roadmaps.
              </div>
            ) : (
              visibleCaches.map(({ id, cache, auth }) => {
                const canDeleteServer = cache.saved && auth?.role === 'owner'
                const canRemoveLocal = !canDeleteServer
                return (
                <div
                  key={id}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 6,
                    background: activeRoadmapId === id ? 'var(--bg-3)' : 'transparent',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'stretch',
                    boxShadow: activeRoadmapId === id ? '0 0 0 1px var(--molten-dim) inset' : 'none'
                  }}
                >
                  <button
                    onClick={() => handleActivateRoadmap(id)}
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
                      <span style={{ fontSize: 13, fontWeight: 500, color: activeRoadmapId === id ? 'var(--ember)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                      onClick={() => handleRequestDelete({
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
              )})
            )}
          </div>

          <div style={{ padding: 8, borderTop: '1px solid var(--border)', background: 'var(--bg-1)' }}>
            {showAddForm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px' }}>
                <input
                  type="text"
                  placeholder="Paste invite link or token..."
                  value={inviteLink}
                  onChange={(e) => {
                    setInviteLink(e.target.value)
                    setError(null)
                  }}
                  style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border-strong)', background: 'var(--bg-3)', color: 'var(--ink)' }}
                  autoFocus
                />
                {needsPassword && (
                  <input
                    type="password"
                    placeholder="Roadmap password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setError(null)
                    }}
                    style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border-strong)', background: 'var(--bg-3)', color: 'var(--ink)' }}
                  />
                )}
                {error && <div style={{ fontSize: 11, color: 'var(--ember)' }}>{error}</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm primary" onClick={handleJoin} disabled={joining} style={{ flex: 1 }}>
                    {joining ? 'Joining...' : 'Join'}
                  </button>
                  <button className="btn sm ghost" onClick={() => {
                    setShowAddForm(false)
                    setError(null)
                    setNeedsPassword(false)
                    setPassword('')
                  }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button 
                  onClick={handleCreateNew}
                  style={{ width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 13, background: 'transparent', border: 'none', color: 'var(--ink-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 4 }}
                >
                  <Icon name="plus" size={14} /> Create new roadmap
                </button>
                <button 
                  onClick={() => setShowAddForm(true)}
                  style={{ width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 13, background: 'transparent', border: 'none', color: 'var(--ink-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 4 }}
                >
                  <Icon name="link" size={14} /> Add by invite link
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <Modal
        open={deleteTarget !== null}
        onClose={() => { setDeleteTarget(null); setError(null) }}
        icon={{ name: 'trash', plain: true }}
        title={
          deleteTarget === null
            ? ''
            : deleteTarget.mode === 'server'
              ? 'Delete roadmap?'
              : deleteTarget.cache.saved
                ? 'Remove from this browser?'
                : 'Remove local draft?'
        }
        sub={
          deleteTarget === null
            ? undefined
            : deleteTarget.mode === 'server'
              ? 'This will delete the RoadForge server copy and disable access for collaborators. This cannot be undone.'
              : deleteTarget.cache.saved
                ? 'This removes the cached roadmap and session from this browser only. The RoadForge server copy is not deleted.'
                : 'This removes the draft from this browser only. It has not been saved to RoadForge.'
        }
        footer={
          <>
            <button className="back" onClick={() => { setDeleteTarget(null); setError(null) }} disabled={deleting}>
              Cancel
            </button>
            <span className="spacer" />
            <button className="btn primary" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting
                ? 'Deleting...'
                : deleteTarget?.mode === 'server'
                  ? 'Delete roadmap'
                  : deleteTarget?.cache.saved
                    ? 'Remove from browser'
                    : 'Remove draft'}
            </button>
          </>
        }
      >
        {deleteTarget !== null && (
          <>
            <div style={{ padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--ink)', fontSize: 14 }}>
              {deleteTarget.cache.roadmapName || 'Untitled Roadmap'}
            </div>
            {error && (
              <div style={{ fontSize: 13, color: 'var(--ember)' }}>{error}</div>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
