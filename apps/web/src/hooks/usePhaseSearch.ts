import { useState, useMemo } from 'react'
import type { Phase } from '@/types/roadmap'

export function usePhaseSearch(phases: Phase[]) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredPhases = useMemo(() => {
    if (!searchQuery.trim()) return phases
    const q = searchQuery.toLowerCase()
    return phases
      .map((p) => ({
        ...p,
        tasks: p.tasks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.id.toLowerCase().includes(q) ||
            (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
        ),
      }))
      .filter((p) => p.tasks.length > 0)
  }, [phases, searchQuery])

  return { searchQuery, setSearchQuery, filteredPhases }
}
