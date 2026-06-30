'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { useRoadmap } from '@/context/RoadmapContext'
import { storage, type AuthCache, type RoadmapCache } from '@/lib/storage'
import { persistJoinResult } from '@/lib/join-flow'
import { deleteRoadmap, getRoadmap } from '@/services/roadmap-crud.service'
import { isApiConnectionError } from '@/services/roadmap-http'
import { joinRoadmap } from '@/services/roadmap-sharing.service'
import { Modal } from '@/components/ui/Modal'
import { RoadmapSwitcherItem } from '@/components/roadmap/RoadmapSwitcherItem'
import { RoadmapSwitcherInviteForm } from '@/components/roadmap/RoadmapSwitcherInviteForm'
import type { ShareRole } from '@/types/roadmap'

interface RoadmapSwitcherProps {
  variant?: 'header' | 'compact' | 'workspace'
  hideWhenEmpty?: boolean
  label?: string
  onCreate?: () => void
}

export interface DeleteTarget {
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
    <div className={`roadmap-switcher ${variant}`} ref={menuRef}>
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
        <div className="switcher-dropdown">
          <div className="switcher-head">
            <div>Your roadmaps</div>
            <div>Stored on this browser</div>
          </div>

          <div className="switcher-list">
            {visibleCaches.length === 0 ? (
              <div className="switcher-empty">
                No stored roadmaps.
              </div>
            ) : (
              visibleCaches.map(({ id, cache, auth }) => (
                <RoadmapSwitcherItem
                  key={id}
                  id={id}
                  cache={cache}
                  auth={auth}
                  active={activeRoadmapId === id}
                  onActivate={handleActivateRoadmap}
                  onRequestDelete={handleRequestDelete}
                />
              ))
            )}
          </div>

          <div className="switcher-footer">
            {showAddForm ? (
              <RoadmapSwitcherInviteForm
                inviteLink={inviteLink}
                password={password}
                needsPassword={needsPassword}
                joining={joining}
                error={error}
                onInviteLinkChange={(value) => { setInviteLink(value); setError(null) }}
                onPasswordChange={(value) => { setPassword(value); setError(null) }}
                onJoin={handleJoin}
                onCancel={() => {
                  setShowAddForm(false)
                  setError(null)
                  setNeedsPassword(false)
                  setPassword('')
                }}
              />
            ) : (
              <div className="switcher-actions">
                <button
                  className="switcher-action"
                  onClick={handleCreateNew}
                >
                  <Icon name="plus" size={14} /> Create new roadmap
                </button>
                <button
                  className="switcher-action"
                  onClick={() => setShowAddForm(true)}
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
            <div className="switcher-modal-preview">
              {deleteTarget.cache.roadmapName || 'Untitled Roadmap'}
            </div>
            {error && (
              <div className="switcher-modal-error">{error}</div>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
