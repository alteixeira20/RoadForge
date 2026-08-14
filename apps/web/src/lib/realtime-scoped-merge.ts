import { mergeAuthoritativePhaseStructureIntoLocalPhases } from '@/lib/realtime-phase-structure-merge'
import type { RealtimeRefreshRequest } from '@/lib/realtime-refresh-request'
import {
  mergeAuthoritativePhaseFieldsIntoLocalPhases,
  type RealtimePhaseField,
} from '@/lib/realtime-structure-merge'
import {
  mergeAuthoritativeTaskDependenciesIntoLocalPhases,
  mergeAuthoritativeTaskStructureIntoLocalPhases,
  taskIdsInPhases,
} from '@/lib/realtime-task-structure-merge'
import {
  mergeAuthoritativeTasksIntoLocalPhases,
  taskIdsInSnapshot,
} from '@/lib/realtime-task-merge'
import type { Phase } from '@/types/roadmap'

interface ScopedRealtimeMergeParams {
  localPhases: Phase[]
  localRoadmapName: string
  serverPhases: Phase[]
  serverRoadmapName: string
  request: RealtimeRefreshRequest
}

export interface ScopedRealtimeMergeResult {
  reconciled: boolean
  phases: Phase[]
  roadmapName: string
  phasesChanged: boolean
  roadmapNameChanged: boolean
}

function localTaskPhaseIds(phases: Phase[]): Map<string, string> {
  return new Map(phases.flatMap((phase) => (
    phase.tasks.map((task) => [task.id, phase.id] as const)
  )))
}

export function mergeAuthoritativeRealtimeScopes({
  localPhases,
  localRoadmapName,
  serverPhases,
  serverRoadmapName,
  request,
}: ScopedRealtimeMergeParams): ScopedRealtimeMergeResult {
  let nextPhases = localPhases
  let nextRoadmapName = localRoadmapName
  let phasesChanged = false
  let roadmapNameChanged = false

  const serverPhaseIds = new Set(serverPhases.map((phase) => phase.id))
  const finalAbsentAffectedPhaseIds = new Set(
    [...request.phaseStructureIds].filter((phaseId) => !serverPhaseIds.has(phaseId)),
  )
  const originalTaskPhaseIds = localTaskPhaseIds(localPhases)

  if (request.phaseStructureIds.size > 0 || request.phaseOrder) {
    const merged = mergeAuthoritativePhaseStructureIntoLocalPhases(
      nextPhases,
      serverPhases,
      request.phaseStructureIds,
      request.phaseOrder,
    )
    if (!merged) {
      return {
        reconciled: false,
        phases: localPhases,
        roadmapName: localRoadmapName,
        phasesChanged: false,
        roadmapNameChanged: false,
      }
    }
    nextPhases = merged
    phasesChanged = true
  }

  const serverTaskIds = taskIdsInPhases(serverPhases)
  const finalAbsentAffectedTaskIds = new Set(
    [...request.taskStructureIds].filter((taskId) => !serverTaskIds.has(taskId)),
  )
  const missingTaskExplained = (taskId: string): boolean => {
    if (finalAbsentAffectedTaskIds.has(taskId)) return true
    const localPhaseId = originalTaskPhaseIds.get(taskId)
    return !!localPhaseId && finalAbsentAffectedPhaseIds.has(localPhaseId)
  }

  if (
    request.taskStructureIds.size > 0
    || request.topLevelTaskOrderPhaseIds.size > 0
    || request.childTaskOrderParentIds.size > 0
  ) {
    const merged = mergeAuthoritativeTaskStructureIntoLocalPhases(
      nextPhases,
      serverPhases,
      request.taskStructureIds,
      request.topLevelTaskOrderPhaseIds,
      request.childTaskOrderParentIds,
    )
    if (!merged) {
      return {
        reconciled: false,
        phases: localPhases,
        roadmapName: localRoadmapName,
        phasesChanged: false,
        roadmapNameChanged: false,
      }
    }
    nextPhases = merged
    phasesChanged = true
  }

  if (request.taskDependencyIds.size > 0) {
    const unexplainedMissing = [...request.taskDependencyIds].some((taskId) => (
      !serverTaskIds.has(taskId) && !missingTaskExplained(taskId)
    ))
    if (unexplainedMissing) {
      return {
        reconciled: false,
        phases: localPhases,
        roadmapName: localRoadmapName,
        phasesChanged: false,
        roadmapNameChanged: false,
      }
    }
    const effectiveTaskIds = [...request.taskDependencyIds].filter((taskId) => (
      serverTaskIds.has(taskId)
    ))
    if (effectiveTaskIds.length > 0) {
      const merged = mergeAuthoritativeTaskDependenciesIntoLocalPhases(
        nextPhases,
        serverPhases,
        effectiveTaskIds,
      )
      if (!merged) {
        return {
          reconciled: false,
          phases: localPhases,
          roadmapName: localRoadmapName,
          phasesChanged: false,
          roadmapNameChanged: false,
        }
      }
      nextPhases = merged
      phasesChanged = true
    }
  }

  if (request.taskIds.size > 0) {
    const unexplainedMissing = [...request.taskIds].some((taskId) => (
      !serverTaskIds.has(taskId) && !missingTaskExplained(taskId)
    ))
    if (unexplainedMissing) {
      return {
        reconciled: false,
        phases: localPhases,
        roadmapName: localRoadmapName,
        phasesChanged: false,
        roadmapNameChanged: false,
      }
    }
    const effectiveTaskIds = [...request.taskIds].filter((taskId) => serverTaskIds.has(taskId))
    if (effectiveTaskIds.length > 0) {
      const merged = mergeAuthoritativeTasksIntoLocalPhases(
        nextPhases,
        serverPhases,
        effectiveTaskIds,
      )
      if (!merged || ![...effectiveTaskIds].every((taskId) => taskIdsInSnapshot(merged).has(taskId))) {
        return {
          reconciled: false,
          phases: localPhases,
          roadmapName: localRoadmapName,
          phasesChanged: false,
          roadmapNameChanged: false,
        }
      }
      nextPhases = merged
      phasesChanged = true
    }
  }

  if (request.phaseFields.size > 0) {
    const effectivePhaseFields = new Map<string, Set<RealtimePhaseField>>()
    for (const [phaseId, fields] of request.phaseFields) {
      if (serverPhaseIds.has(phaseId)) {
        effectivePhaseFields.set(phaseId, new Set(fields))
        continue
      }
      if (!finalAbsentAffectedPhaseIds.has(phaseId)) {
        return {
          reconciled: false,
          phases: localPhases,
          roadmapName: localRoadmapName,
          phasesChanged: false,
          roadmapNameChanged: false,
        }
      }
    }
    if (effectivePhaseFields.size > 0) {
      const merged = mergeAuthoritativePhaseFieldsIntoLocalPhases(
        nextPhases,
        serverPhases,
        effectivePhaseFields,
      )
      if (!merged) {
        return {
          reconciled: false,
          phases: localPhases,
          roadmapName: localRoadmapName,
          phasesChanged: false,
          roadmapNameChanged: false,
        }
      }
      nextPhases = merged
      phasesChanged = true
    }
  }

  if (request.roadmapFields.has('name')) {
    nextRoadmapName = serverRoadmapName
    roadmapNameChanged = nextRoadmapName !== localRoadmapName
  }

  return {
    reconciled: true,
    phases: nextPhases,
    roadmapName: nextRoadmapName,
    phasesChanged,
    roadmapNameChanged,
  }
}
