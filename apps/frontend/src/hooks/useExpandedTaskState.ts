import { useEffect, useRef, useState } from 'react'
import { storage } from '@/lib/storage'
import type { Task } from '@/types/roadmap'

type UseExpandedTaskStateParams = {
  activeRoadmapId: string | null
  allTasks: Task[]
}

type UseExpandedTaskStateResult = {
  expandedTaskId: string | null
  setExpandedTaskId: (id: string | null) => void
  toggleExpandedTask: (taskId: string) => void
}

export function useExpandedTaskState({
  activeRoadmapId,
  allTasks,
}: UseExpandedTaskStateParams): UseExpandedTaskStateResult {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(() => {
    if (!activeRoadmapId) return null
    return storage.getRoadmapUiState(activeRoadmapId)?.expandedTaskId ?? null
  })
  const prevActiveRoadmapIdRef = useRef(activeRoadmapId)
  // Tracks which roadmap the current expandedTaskId belongs to.
  // Prevents writing previous-roadmap expandedTaskId into the new roadmap's UI cache
  // during the render where activeRoadmapId changes but expandedTaskId hasn't updated yet.
  const expandedTaskOwnerRef = useRef(activeRoadmapId)

  // Combined effect handles both roadmap switches and same-roadmap task-list changes.
  // Merging the concerns prevents same-pass validation of the previous roadmap's
  // expandedTaskId from overwriting the restored value for the new roadmap.
  useEffect(() => {
    const roadmapIdChanged = prevActiveRoadmapIdRef.current !== activeRoadmapId
    prevActiveRoadmapIdRef.current = activeRoadmapId

    if (roadmapIdChanged) {
      // React batches the roadmap ID and phases update, so allTasks already belongs
      // to the new roadmap and can validate its restored expanded task immediately.
      const savedId = activeRoadmapId
        ? storage.getRoadmapUiState(activeRoadmapId)?.expandedTaskId ?? null
        : null
      const valid = savedId !== null && allTasks.some((task) => task.id === savedId)
        ? savedId
        : null
      setExpandedTaskId(valid)
      return
    }

    if (expandedTaskId && !allTasks.some((task) => task.id === expandedTaskId)) {
      setExpandedTaskId(null)
    }
  // expandedTaskId is intentionally omitted: validation should rerun for task-list
  // changes such as deletion, not merely because the user toggled the expanded task.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoadmapId, allTasks])

  // When activeRoadmapId changes, expandedTaskId still belongs to the previous roadmap
  // for one render. Skip that write, transfer ownership, and persist after restoration
  // delivers the new roadmap's expandedTaskId.
  useEffect(() => {
    if (!activeRoadmapId) return
    if (expandedTaskOwnerRef.current !== activeRoadmapId) {
      expandedTaskOwnerRef.current = activeRoadmapId
      return
    }
    const current = storage.getRoadmapUiState(activeRoadmapId) ?? {
      schemaVersion: 1 as const,
      openPhaseIds: [],
      expandedTaskId: null,
      updatedAt: new Date().toISOString(),
    }
    storage.setRoadmapUiState(activeRoadmapId, {
      ...current,
      expandedTaskId,
      updatedAt: new Date().toISOString(),
    })
  }, [expandedTaskId, activeRoadmapId])

  const toggleExpandedTask = (taskId: string) => {
    setExpandedTaskId((current) => (current === taskId ? null : taskId))
  }

  return { expandedTaskId, setExpandedTaskId, toggleExpandedTask }
}
