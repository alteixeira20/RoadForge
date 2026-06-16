'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Brand } from '@/components/ui/Brand'
import { Icon } from '@/components/ui/Icon'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useRoadmap } from '@/context/RoadmapContext'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import { persistJoinResult } from '@/lib/join-flow'
import { getRoadmap } from '@/services/roadmap-crud.service'
import { joinRoadmap } from '@/services/roadmap-sharing.service'
import { storage } from '@/lib/storage'
import type { ShareRole } from '@/types/roadmap'

export function JoinPage() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')

  const {
    setDisplayName,
    setServerRoadmapId,
    setSessionToken,
    setParticipantId,
    setRole,
    setRoadmapName,
    setPhases,
    setSaved,
    setOwnerDisplayName,
  } = useRoadmap()

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsPassword, setNeedsPassword] = useState(false)

  if (!token) {
    return (
      <div className="join-page">
        <div className="join-card">
          <div className="top">
            <Brand />
          </div>
          <h1>Invalid invite link</h1>
          <p className="sum">
            This link is missing an invite token. Ask the roadmap owner for a fresh link.
          </p>
          <button className="btn lg" onClick={() => router.push('/')}>
            Go home
          </button>
        </div>
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 40 }}>
          <ThemeToggle />
        </div>
      </div>
    )
  }

  const handleJoin = async () => {
    if (joining) return
    setJoining(true)
    setError(null)
    try {
      const { roadmapId, roadmapName, role, sessionToken, participantId } = await joinRoadmap(
        token,
        name.trim() || undefined,
        password || undefined,
      )
      
      persistJoinResult({ roadmapId, roadmapName, role: role as ShareRole, sessionToken, participantId })

      setServerRoadmapId(roadmapId)
      setSessionToken(sessionToken)
      setParticipantId(participantId)
      setRole(role as ShareRole)
      setRoadmapName(roadmapName)
      setPhases([])
      setOwnerDisplayName(null)
      if (name.trim()) setDisplayName(name.trim())

      try {
        const roadmap = await getRoadmap(roadmapId, sessionToken)
        const upgraded = upgradeRoadmapSnapshot({
          roadmapName: roadmap.roadmap.name,
          phases: roadmap.phases,
        })
        const nextRoadmapName = upgraded.roadmapName || roadmap.roadmap.name
        const canPersistUpgrade = role === 'owner' || role === 'editor'
        const nextSaved = !(upgraded.changed && canPersistUpgrade)
        setRoadmapName(nextRoadmapName)
        setPhases(upgraded.phases)
        setSaved(nextSaved)
        setOwnerDisplayName(roadmap.ownerDisplayName)
        
        storage.setRoadmapCache(roadmapId, {
          roadmapName: nextRoadmapName,
          phases: upgraded.phases,
          saved: nextSaved,
          ownerDisplayName: roadmap.ownerDisplayName,
          updatedAt: roadmap.updatedAt,
          isPasswordEnabled: !!roadmap.roadmap.isPasswordEnabled,
        })
      } catch {
        // non-fatal — workspace will show whatever's cached
      }

      const path = role === 'viewer' ? '/shared' : '/workspace'
      router.push(`${path}?roadmap=${encodeURIComponent(roadmapId)}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('password')) {
        setNeedsPassword(true)
        setError('This roadmap requires a password.')
      } else if (msg.includes('401') || msg.includes('Invalid')) {
        setError('This invite link is invalid or has expired. Ask the owner for a new one.')
      } else {
        setError('Could not join — check your connection and try again.')
      }
      setJoining(false)
    }
  }

  return (
    <div className="join-page">
      <div className="join-card">
        <div className="top">
          <Brand />
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <span style={{ fontSize: 13 }}>You&apos;ve been invited.</span>
        </div>

        <div>
          <h1>Join roadmap</h1>
          <p className="sum">
            Enter your display name so collaborators can see who&apos;s editing.
            No account required.
          </p>
        </div>

        <div className="field">
          <label htmlFor="jn">Display name (optional)</label>
          <input
            id="jn"
            className="input"
            placeholder="e.g. Jordan M."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleJoin() }}
          />
          <span className="hint">
            Just a label so others can see who&apos;s editing. No account required.
          </span>
        </div>

        {needsPassword && (
          <div className="field">
            <label htmlFor="jpw">Roadmap password</label>
            <input
              id="jpw"
              className="input"
              type="password"
              placeholder="Enter the roadmap password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleJoin() }}
              autoFocus
            />
          </div>
        )}

        {error && (
          <div className="note-line" style={{ borderColor: 'rgba(217,116,66,0.40)' }}>
            <span className="ic">
              <Icon name="x" size={14} />
            </span>
            <span>{error}</span>
          </div>
        )}

        <div className="note-line">
          <span className="ic">
            <Icon name="lock" size={14} />
          </span>
          <span>
            This invite is signed and revocable. Anvilary does not collect
            emails, telemetry, or account data.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="btn primary lg"
            disabled={joining}
            style={{ flex: 1, opacity: joining ? 0.5 : 1 }}
            onClick={handleJoin}
          >
            {joining ? 'Joining…' : <>Open roadmap <Icon name="arrow-right" size={15} stroke="#fff" /></>}
          </button>
          <button className="btn lg" onClick={() => router.push('/')}>
            Create your own
          </button>
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 40 }}>
        <ThemeToggle />
      </div>
    </div>
  )
}
