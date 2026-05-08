'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useRoadmap } from '@/context/RoadmapContext'
import { joinRoadmap } from '@/services/roadmap.service'

// TODO(backend): read the real invite token from URL search params once the
// share-link system is wired (e.g. /join?token=ed_2bD7…XqL).
const MOCK_TOKEN = 'demo-invite-token'

export function JoinPage() {
  const router = useRouter()
  const { setDisplayName } = useRoadmap()
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoin = async () => {
    if (!name.trim() || joining) return
    setJoining(true)
    setError(null)
    try {
      const { role } = await joinRoadmap(MOCK_TOKEN, name.trim())
      setDisplayName(name.trim())
      router.push(role === 'viewer' ? '/shared' : '/workspace')
    } catch {
      setError('Could not join — the invite link may be invalid or expired.')
      setJoining(false)
    }
  }

  const handleCreateOwn = () => {
    router.push('/')
  }

  return (
    <div className="join-page">
      <div className="join-card">
        <div className="top">
          <div className="brand">
            <div className="mark">
              <Icon name="anvil" size={15} stroke="#f5853f" strokeWidth={1.7} />
            </div>
            <span>Roadforge</span>
          </div>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <span style={{ fontSize: 13 }}>You&apos;ve been invited.</span>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span className="role-pill">
              <Icon name="users" size={11} /> Editor
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Joining as</span>
          </div>
          <h1>v1.0 Public Launch</h1>
          <p className="sum">
            You&apos;re joining a roadmap as an{' '}
            <b style={{ color: 'var(--ink)' }}>Editor</b>. You&apos;ll be able to add
            tasks, mark them done, and link dependencies. The owner can change
            your role anytime.
          </p>
        </div>

        <div className="preview-tile">
          <div className="ic">
            <Icon name="anvil" size={14} />
          </div>
          <div className="meta">
            <span className="nm">Roadforge — v1.0 Public Launch</span>
            <span className="ph">5 phases · 19 tasks · invited by Ada Lovelace</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="jn">Your display name</label>
          <input
            id="jn"
            className="input"
            placeholder="e.g. Jordan M."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) handleJoin()
            }}
          />
          <span className="hint">
            Just a label so others can see who&apos;s editing. No account required.
          </span>
        </div>

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
            This invite is signed and revocable. Roadforge does not collect
            emails, telemetry, or account data.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="btn primary lg"
            disabled={!name.trim() || joining}
            style={{ flex: 1, opacity: name.trim() && !joining ? 1 : 0.5 }}
            onClick={handleJoin}
          >
            {joining ? 'Joining…' : <>Join roadmap <Icon name="arrow-right" size={15} stroke="#fff" /></>}
          </button>
          <button className="btn lg" onClick={handleCreateOwn}>
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
