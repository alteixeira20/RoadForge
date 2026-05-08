'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { Phase } from '@/types/roadmap'
import { SAMPLE_ROADMAP } from '@/data/sample-roadmap'
import { storage } from '@/lib/storage'

interface RoadmapContextValue {
  displayName: string
  setDisplayName: (name: string) => void
  roadmapName: string
  setRoadmapName: (name: string) => void
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  /** Whether the roadmap has been "saved to server" (mocked). */
  saved: boolean
  setSaved: (saved: boolean) => void
  /** Server-side roadmap record ID. Null until the roadmap has been saved to the server. */
  serverRoadmapId: string | null
  setServerRoadmapId: (id: string | null) => void
  resetToSample: () => void
}

const RoadmapContext = createContext<RoadmapContextValue | null>(null)

export function RoadmapProvider({ children }: { children: ReactNode }) {
  const [displayName, setDisplayNameState] = useState('')
  const [roadmapName, setRoadmapNameState] = useState('v1.0 Public Launch')
  // TODO(backend): replace with getRoadmap(serverRoadmapId) once an ID is available in context.
  const [phases, setPhasesState] = useState<Phase[]>(SAMPLE_ROADMAP.phases)
  const [saved, setSavedState] = useState(false)
  const [serverRoadmapId, setServerRoadmapIdState] = useState<string | null>(null)

  // Hydrate from localStorage once on client mount
  useEffect(() => {
    const storedDisplayName = storage.getDisplayName()
    if (storedDisplayName !== null) setDisplayNameState(storedDisplayName)

    const storedRoadmapName = storage.getRoadmapName()
    if (storedRoadmapName !== null) setRoadmapNameState(storedRoadmapName)

    const storedPhases = storage.getPhases()
    if (storedPhases !== null) setPhasesState(storedPhases)

    setSavedState(storage.getSaved())
    const storedServerId = storage.getServerRoadmapId()
    if (storedServerId !== null) setServerRoadmapIdState(storedServerId)
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

  const resetToSample = useCallback(() => {
    storage.clearAll()
    setDisplayNameState('')
    setRoadmapNameState('v1.0 Public Launch')
    setPhasesState(SAMPLE_ROADMAP.phases)
    setSavedState(false)
    setServerRoadmapIdState(null)
  }, [])

  return (
    <RoadmapContext.Provider
      value={{ displayName, setDisplayName, roadmapName, setRoadmapName, phases, setPhases, saved, setSaved, serverRoadmapId, setServerRoadmapId, resetToSample }}
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
