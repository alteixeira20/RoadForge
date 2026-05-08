import { useState } from 'react'
import type { Phase } from '@/types/roadmap'

export function usePhaseCollapse(phases: Phase[]) {
  const [openPhases, setOpenPhases] = useState<string[]>(['p2'])

  const togglePhase = (id: string) =>
    setOpenPhases((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const allOpen = openPhases.length === phases.length
  const collapseAll = () => setOpenPhases([])
  const expandAll = () => setOpenPhases(phases.map((p) => p.id))

  return { openPhases, togglePhase, allOpen, collapseAll, expandAll }
}
