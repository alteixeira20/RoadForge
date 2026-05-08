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
  resetToSample: () => void
}

const RoadmapContext = createContext<RoadmapContextValue | null>(null)

export function RoadmapProvider({ children }: { children: ReactNode }) {
  const [displayName, setDisplayNameState] = useState('')
  const [roadmapName, setRoadmapNameState] = useState('v1.0 Public Launch')
  // TODO(backend): replace with getRoadmap() call once auth + IDs exist.
  const [phases, setPhasesState] = useState<Phase[]>(SAMPLE_ROADMAP.phases)
  const [saved, setSavedState] = useState(false)

  // Hydrate from localStorage once on client mount
  useEffect(() => {
    const storedDisplayName = storage.getDisplayName()
    if (storedDisplayName !== null) setDisplayNameState(storedDisplayName)

    const storedRoadmapName = storage.getRoadmapName()
    if (storedRoadmapName !== null) setRoadmapNameState(storedRoadmapName)

    const storedPhases = storage.getPhases()
    if (storedPhases !== null) setPhasesState(storedPhases)

    setSavedState(storage.getSaved())
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

  const resetToSample = useCallback(() => {
    storage.clearAll()
    setDisplayNameState('')
    setRoadmapNameState('v1.0 Public Launch')
    setPhasesState(SAMPLE_ROADMAP.phases)
    setSavedState(false)
  }, [])

  return (
    <RoadmapContext.Provider
      value={{ displayName, setDisplayName, roadmapName, setRoadmapName, phases, setPhases, saved, setSaved, resetToSample }}
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
