'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useRoadmap } from '@/context/RoadmapContext'
import { storage } from '@/lib/storage'
import { joinRoadmap, getRoadmap } from '@/services/roadmap.service'
import type { ShareRole } from '@/types/roadmap'

export function RoadmapSwitcher() {
  const {
    displayName,
    activeRoadmapId,
    activateRoadmap,
    resetToSample,
  } = useRoadmap()

  const [isOpen, setIsOpen] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const menuRef = useRef<HTMLDivElement>(null)

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

  const caches = storage.listRoadmapCaches()

  const initials = ((displayName || 'You')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('') || 'Y'
  ).toUpperCase()

  const handleCreateNew = () => {
    resetToSample()
    setIsOpen(false)
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

      const { roadmapId, role, sessionToken, participantId } = await joinRoadmap(
        token,
        displayName.trim() || undefined,
        password || undefined,
      )

      storage.setActiveRoadmapId(roadmapId)
      storage.setLastRoadmapId(roadmapId)
      storage.setAuthCache(roadmapId, {
        serverRoadmapId: roadmapId,
        sessionToken,
        participantId,
        role: role as ShareRole,
      })

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

  return (
    <div className="roadmap-switcher" ref={menuRef} style={{ position: 'relative' }}>
      <button 
        className="avatar" 
        title="Open workspace menu"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open workspace menu"
      >
        {initials}
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
            {caches.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>
                No stored roadmaps.
              </div>
            ) : (
              caches.map(({ id, cache, auth }) => (
                <button
                  key={id}
                  onClick={() => {
                    activateRoadmap(id)
                    setIsOpen(false)
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: activeRoadmapId === id ? 'var(--bg-3)' : 'transparent',
                    border: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    cursor: 'pointer',
                    boxShadow: activeRoadmapId === id ? '0 0 0 1px var(--molten-dim) inset' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: activeRoadmapId === id ? 'var(--ember)' : 'var(--ink)' }}>
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
              ))
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
                  <Icon name="plus" size={14} /> New local roadmap
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
    </div>
  )
}
