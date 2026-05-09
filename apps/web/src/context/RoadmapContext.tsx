'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { Phase, ShareRole } from '@/types/roadmap'
import { SAMPLE_ROADMAP } from '@/data/sample-roadmap'
import { storage } from '@/lib/storage'
import { getRoadmap } from '@/services/roadmap.service'

interface RoadmapContextValue {
  displayName: string
  setDisplayName: (name: string) => void
  roadmapName: string
  setRoadmapName: (name: string) => void
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  /** Whether the roadmap has been saved to the server. */
  saved: boolean
  setSaved: (saved: boolean) => void
  /** Server-side roadmap record ID. Null until the roadmap has been saved to the server. */
  serverRoadmapId: string | null
  setServerRoadmapId: (id: string | null) => void
  /** Session token returned by createRoadmap or join. Null until first server save. */
  sessionToken: string | null
  setSessionToken: (value: string | null) => void
  /** Participant ID returned by join. Null for the owner flow (create). */
  participantId: string | null
  setParticipantId: (value: string | null) => void
  /** Collaboration role for this session. */
  role: ShareRole | null
  setRole: (value: ShareRole | null) => void
  resetToSample: () => void
}

const RoadmapContext = createContext<RoadmapContextValue | null>(null)

export function RoadmapProvider({ children }: { children: ReactNode }) {
  const [displayName, setDisplayNameState] = useState('')
  const [roadmapName, setRoadmapNameState] = useState('v1.0 Public Launch')
  const [phases, setPhasesState] = useState<Phase[]>(SAMPLE_ROADMAP.phases)
  const [saved, setSavedState] = useState(false)
  const [serverRoadmapId, setServerRoadmapIdState] = useState<string | null>(null)
  const [sessionToken, setSessionTokenState] = useState<string | null>(null)
  const [participantId, setParticipantIdState] = useState<string | null>(null)
  const [role, setRoleState] = useState<ShareRole | null>(null)

  // Hydrate from localStorage once on client mount, then re-sync from server if an ID is available.
  useEffect(() => {
    let cancelled = false

    const storedDisplayName = storage.getDisplayName()
    if (storedDisplayName !== null) setDisplayNameState(storedDisplayName)

    const storedRoadmapName = storage.getRoadmapName()
    if (storedRoadmapName !== null) setRoadmapNameState(storedRoadmapName)

    const storedPhases = storage.getPhases()
    if (storedPhases !== null) setPhasesState(storedPhases)

    setSavedState(storage.getSaved())

    const storedServerId = storage.getServerRoadmapId()
    if (storedServerId !== null) {
      setServerRoadmapIdState(storedServerId)
      getRoadmap(storedServerId)
        .then((loaded) => {
          if (cancelled) return
          setRoadmapNameState(loaded.roadmap.name)
          setPhasesState(loaded.phases)
          setSavedState(true)
        })
        .catch(() => {
          // Backend offline or roadmap gone — keep localStorage state, no crash.
        })
    }

    const storedSessionToken = storage.getSessionToken()
    if (storedSessionToken !== null) setSessionTokenState(storedSessionToken)
    const storedParticipantId = storage.getParticipantId()
    if (storedParticipantId !== null) setParticipantIdState(storedParticipantId)
    const storedRole = storage.getRole()
    if (storedRole !== null) setRoleState(storedRole)

    return () => { cancelled = true }
  }, [])

  const setDisplayName = useCallback((name: string) => {
    setDisplayNameState(name)
    storage.setDisplayName(name)
  }, [])

  const setRoadmapName = useCallback((name: string) => {
    setRoadmapNameState(name)
    storage.setRoadmapName(name)
  }, [])

  const setPhases = useCallback((p: Phase[]) => {
    setPhasesState(p)
    storage.setPhases(p)
  }, [])

  const setSaved = useCallback((s: boolean) => {
    setSavedState(s)
    storage.setSaved(s)
  }, [])

  const setServerRoadmapId = useCallback((id: string | null) => {
    setServerRoadmapIdState(id)
    storage.setServerRoadmapId(id)
  }, [])

  const setSessionToken = useCallback((value: string | null) => {
    setSessionTokenState(value)
    storage.setSessionToken(value)
  }, [])

  const setParticipantId = useCallback((value: string | null) => {
    setParticipantIdState(value)
    storage.setParticipantId(value)
  }, [])

  const setRole = useCallback((value: ShareRole | null) => {
    setRoleState(value)
    storage.setRole(value)
  }, [])

  const resetToSample = useCallback(() => {
    storage.clearAll()
    setDisplayNameState('')
    setRoadmapNameState('v1.0 Public Launch')
    setPhasesState(SAMPLE_ROADMAP.phases)
    setSavedState(false)
    setServerRoadmapIdState(null)
    setSessionTokenState(null)
    setParticipantIdState(null)
    setRoleState(null)
  }, [])

  return (
    <RoadmapContext.Provider
      value={{ displayName, setDisplayName, roadmapName, setRoadmapName, phases, setPhases, saved, setSaved, serverRoadmapId, setServerRoadmapId, sessionToken, setSessionToken, participantId, setParticipantId, role, setRole, resetToSample }}
    >
      {children}
    </RoadmapContext.Provider>
  )
}

export function useRoadmap(): RoadmapContextValue {
  const ctx = useContext(RoadmapContext)
  if (!ctx) throw new Error('useRoadmap must be used inside <RoadmapProvider>')
  return ctx
}
