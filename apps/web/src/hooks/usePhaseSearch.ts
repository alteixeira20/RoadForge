import { useState, useMemo } from 'react'
import { getTaskAssignees, getVisibleTaskTags } from '@/lib/task-assignment'
import type { Phase } from '@/types/roadmap'

export function usePhaseSearch(phases: Phase[]) {
  const [searchQuery, setSearchQuery] = useState('')

  const { filteredPhases, matchingPhaseIds } = useMemo(() => {
    if (!searchQuery.trim()) return { filteredPhases: phases, matchingPhaseIds: [] }
    const q = searchQuery.toLowerCase()
    
    const filtered = phases
      .map((p) => ({
        ...p,
        tasks: p.tasks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.id.toLowerCase().includes(q) ||
            getVisibleTaskTags(t).some((tag) => tag.toLowerCase().includes(q)) ||
            getTaskAssignees(t).some((assignee) => assignee.toLowerCase().includes(q)),
        ),
      }))
      .filter((p) => p.tasks.length > 0)

    const ids = filtered.map(p => p.id)
    return { filteredPhases: filtered, matchingPhaseIds: ids }
  }, [phases, searchQuery])

  return { searchQuery, setSearchQuery, filteredPhases, matchingPhaseIds }
}
