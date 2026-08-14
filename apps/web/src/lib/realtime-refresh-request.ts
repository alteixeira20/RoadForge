import {
  getRealtimePhaseFields,
  getRealtimeRoadmapFields,
  type RealtimePhaseField,
  type RealtimeRoadmapField,
} from '@/lib/realtime-structure-merge'
import type { RoadmapUpdatedEventPayload } from '@/services/roadmap-realtime.service'

export interface RealtimeRefreshRequest {
  full: boolean
  taskIds: Set<string>
  taskStructureIds: Set<string>
  taskDependencyIds: Set<string>
  topLevelTaskOrderPhaseIds: Set<string>
  childTaskOrderParentIds: Set<string>
  phaseFields: Map<string, Set<RealtimePhaseField>>
  phaseStructureIds: Set<string>
  phaseOrder: boolean
  roadmapFields: Set<RealtimeRoadmapField>
}

export function createRealtimeRefreshRequest(full = false): RealtimeRefreshRequest {
  return {
    full,
    taskIds: new Set(),
    taskStructureIds: new Set(),
    taskDependencyIds: new Set(),
    topLevelTaskOrderPhaseIds: new Set(),
    childTaskOrderParentIds: new Set(),
    phaseFields: new Map(),
    phaseStructureIds: new Set(),
    phaseOrder: false,
    roadmapFields: new Set(),
  }
}

function mergeSet<T>(target: Set<T>, source: Iterable<T>) {
  for (const item of source) target.add(item)
}

function mergePhaseFields(
  target: Map<string, Set<RealtimePhaseField>>,
  source: ReadonlyMap<string, ReadonlySet<RealtimePhaseField>>,
) {
  for (const [phaseId, fields] of source) {
    const targetFields = target.get(phaseId) ?? new Set<RealtimePhaseField>()
    mergeSet(targetFields, fields)
    target.set(phaseId, targetFields)
  }
}

export function cloneRealtimeRefreshRequest(
  request: RealtimeRefreshRequest,
): RealtimeRefreshRequest {
  const cloned = createRealtimeRefreshRequest(request.full)
  mergeSet(cloned.taskIds, request.taskIds)
  mergeSet(cloned.taskStructureIds, request.taskStructureIds)
  mergeSet(cloned.taskDependencyIds, request.taskDependencyIds)
  mergeSet(cloned.topLevelTaskOrderPhaseIds, request.topLevelTaskOrderPhaseIds)
  mergeSet(cloned.childTaskOrderParentIds, request.childTaskOrderParentIds)
  mergePhaseFields(cloned.phaseFields, request.phaseFields)
  mergeSet(cloned.phaseStructureIds, request.phaseStructureIds)
  cloned.phaseOrder = request.phaseOrder
  mergeSet(cloned.roadmapFields, request.roadmapFields)
  return cloned
}

export function mergeRealtimeRefreshRequest(
  target: RealtimeRefreshRequest,
  source: RealtimeRefreshRequest,
) {
  target.full ||= source.full
  mergeSet(target.taskIds, source.taskIds)
  mergeSet(target.taskStructureIds, source.taskStructureIds)
  mergeSet(target.taskDependencyIds, source.taskDependencyIds)
  mergeSet(target.topLevelTaskOrderPhaseIds, source.topLevelTaskOrderPhaseIds)
  mergeSet(target.childTaskOrderParentIds, source.childTaskOrderParentIds)
  mergePhaseFields(target.phaseFields, source.phaseFields)
  mergeSet(target.phaseStructureIds, source.phaseStructureIds)
  target.phaseOrder ||= source.phaseOrder
  mergeSet(target.roadmapFields, source.roadmapFields)
}

export function hasScopedRealtimeRefresh(request: RealtimeRefreshRequest): boolean {
  return request.taskIds.size > 0
    || request.taskStructureIds.size > 0
    || request.taskDependencyIds.size > 0
    || request.topLevelTaskOrderPhaseIds.size > 0
    || request.childTaskOrderParentIds.size > 0
    || request.phaseFields.size > 0
    || request.phaseStructureIds.size > 0
    || request.phaseOrder
    || request.roadmapFields.size > 0
}

function addTaskStructureIds(
  request: RealtimeRefreshRequest,
  payload: RoadmapUpdatedEventPayload,
) {
  const ids = payload.task_ids?.length
    ? payload.task_ids
    : payload.task_id
      ? [payload.task_id]
      : []
  mergeSet(request.taskStructureIds, ids)
}

function addTaskOrderScope(
  request: RealtimeRefreshRequest,
  payload: RoadmapUpdatedEventPayload,
) {
  if (payload.parent_id) {
    request.childTaskOrderParentIds.add(payload.parent_id)
  } else if (payload.phase_id) {
    request.topLevelTaskOrderPhaseIds.add(payload.phase_id)
  }
}

export function realtimeRefreshRequestFromEvent(
  payload: RoadmapUpdatedEventPayload,
): RealtimeRefreshRequest | null {
  const request = createRealtimeRefreshRequest()

  if (payload.task_operation) {
    if (payload.task_operation === 'created' || payload.task_operation === 'deleted') {
      addTaskStructureIds(request, payload)
    }
    addTaskOrderScope(request, payload)
  } else if (
    payload.action === 'task.dependency.linked'
    || payload.action === 'task.dependency.unlinked'
  ) {
    if (payload.task_id) request.taskDependencyIds.add(payload.task_id)
  } else if (payload.task_id) {
    request.taskIds.add(payload.task_id)
  }

  if (payload.phase_operation) {
    if (payload.phase_operation === 'created' || payload.phase_operation === 'deleted') {
      if (payload.phase_id) request.phaseStructureIds.add(payload.phase_id)
      request.phaseOrder = true
    } else if (payload.phase_operation === 'reordered') {
      request.phaseOrder = true
    }
  } else if (payload.phase_id) {
    const fields = getRealtimePhaseFields(payload.changed_fields)
    if (fields.length > 0) request.phaseFields.set(payload.phase_id, new Set(fields))
  }

  mergeSet(request.roadmapFields, getRealtimeRoadmapFields(payload.roadmap_fields))
  return hasScopedRealtimeRefresh(request) ? request : null
}
