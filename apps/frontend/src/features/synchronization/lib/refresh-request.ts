import { isNewerServerRevision } from '@/shared/domain/server-revision'
import type { RoadmapUpdatedEventPayload } from '@/features/synchronization/services/realtime.service'
import type { RealtimeTaskOrderScope } from './realtime-task-structure-merge'
import {
  getRealtimePhaseFields,
  getRealtimeRoadmapFields,
  type RealtimePhaseField,
  type RealtimeRoadmapField,
} from './realtime-structure-merge'

export interface RealtimeRefreshRequest {
  full: boolean
  isResync: boolean
  maxEventUpdatedAt: string | null
  taskIds: Set<string>
  taskFields: Map<string, Set<string>>
  createdTaskIds: Set<string>
  deletedTaskIds: Set<string>
  taskOrderScopes: Map<string, RealtimeTaskOrderScope>
  phaseFields: Map<string, Set<RealtimePhaseField>>
  phaseStructureIds: Set<string>
  phaseOrderChanged: boolean
  roadmapFields: Set<RealtimeRoadmapField>
  tagChanged: boolean
}

export function taskOrderScopeKey(phaseId: string, parentId: string | null): string {
  return `${phaseId}\u0000${parentId ?? ''}`
}

export function createRefreshRequest(full = false, isResync = false): RealtimeRefreshRequest {
  return {
    full,
    isResync,
    maxEventUpdatedAt: null,
    taskIds: new Set(),
    taskFields: new Map(),
    createdTaskIds: new Set(),
    deletedTaskIds: new Set(),
    taskOrderScopes: new Map(),
    phaseFields: new Map(),
    phaseStructureIds: new Set(),
    phaseOrderChanged: false,
    roadmapFields: new Set(),
    tagChanged: false,
  }
}

export function cloneRefreshRequest(request: RealtimeRefreshRequest): RealtimeRefreshRequest {
  return {
    full: request.full,
    isResync: request.isResync,
    maxEventUpdatedAt: request.maxEventUpdatedAt,
    taskIds: new Set(request.taskIds),
    taskFields: new Map(
      [...request.taskFields].map(([taskId, fields]) => [taskId, new Set(fields)]),
    ),
    createdTaskIds: new Set(request.createdTaskIds),
    deletedTaskIds: new Set(request.deletedTaskIds),
    taskOrderScopes: new Map(request.taskOrderScopes),
    phaseFields: new Map(
      [...request.phaseFields].map(([phaseId, fields]) => [phaseId, new Set(fields)]),
    ),
    phaseStructureIds: new Set(request.phaseStructureIds),
    phaseOrderChanged: request.phaseOrderChanged,
    roadmapFields: new Set(request.roadmapFields),
    tagChanged: request.tagChanged,
  }
}

export function mergeRefreshRequest(
  target: RealtimeRefreshRequest,
  source: RealtimeRefreshRequest,
): void {
  target.full ||= source.full
  target.isResync ||= source.isResync
  target.phaseOrderChanged ||= source.phaseOrderChanged
  target.tagChanged ||= source.tagChanged
  if (source.maxEventUpdatedAt) {
    if (!target.maxEventUpdatedAt || isNewerServerRevision(source.maxEventUpdatedAt, target.maxEventUpdatedAt)) {
      target.maxEventUpdatedAt = source.maxEventUpdatedAt
    }
  }
  source.taskIds.forEach((taskId) => target.taskIds.add(taskId))
  source.createdTaskIds.forEach((taskId) => target.createdTaskIds.add(taskId))
  source.deletedTaskIds.forEach((taskId) => target.deletedTaskIds.add(taskId))
  source.taskOrderScopes.forEach((scope, key) => target.taskOrderScopes.set(key, scope))
  source.phaseStructureIds.forEach((phaseId) => target.phaseStructureIds.add(phaseId))
  source.roadmapFields.forEach((field) => target.roadmapFields.add(field))
  for (const [phaseId, fields] of source.phaseFields) {
    const targetFields = target.phaseFields.get(phaseId) ?? new Set<RealtimePhaseField>()
    fields.forEach((field) => targetFields.add(field))
    target.phaseFields.set(phaseId, targetFields)
  }
  for (const [taskId, fields] of source.taskFields) {
    const targetFields = target.taskFields.get(taskId) ?? new Set<string>()
    fields.forEach((field) => targetFields.add(field))
    target.taskFields.set(taskId, targetFields)
  }
}

export function hasScopedRefresh(request: RealtimeRefreshRequest): boolean {
  return request.taskIds.size > 0
    || request.createdTaskIds.size > 0
    || request.deletedTaskIds.size > 0
    || request.taskOrderScopes.size > 0
    || request.phaseFields.size > 0
    || request.phaseStructureIds.size > 0
    || request.phaseOrderChanged
    || request.roadmapFields.size > 0
    || request.tagChanged
}

export function refreshRequestFromEvent(
  payload: RoadmapUpdatedEventPayload,
): RealtimeRefreshRequest | null {
  const request = createRefreshRequest(false, false)
  request.maxEventUpdatedAt = payload.updated_at

  if (payload.task_operation === 'created') {
    if (payload.task_id) request.createdTaskIds.add(payload.task_id)
  } else if (payload.task_operation === 'deleted') {
    const deletedIds = payload.task_ids?.length
      ? payload.task_ids
      : payload.task_id ? [payload.task_id] : []
    deletedIds.forEach((taskId) => request.deletedTaskIds.add(taskId))
  } else if (payload.task_operation === 'reordered') {
    if (payload.phase_id) {
      const scope = {
        phaseId: payload.phase_id,
        parentId: payload.parent_id ?? null,
      }
      request.taskOrderScopes.set(
        taskOrderScopeKey(scope.phaseId, scope.parentId),
        scope,
      )
    }
  } else if (payload.task_id) {
    request.taskIds.add(payload.task_id)
    const taskFields = new Set<string>()
    if (payload.action === 'task.completed' || payload.action === 'task.reopened') {
      taskFields.add('done')
      taskFields.add('claimedBy')
      taskFields.add('claimedById')
      taskFields.add('claimedAt')
    } else if (payload.action === 'task.claimed' || payload.action === 'task.unclaimed') {
      taskFields.add('claimedBy')
      taskFields.add('claimedById')
      taskFields.add('claimedAt')
    } else if (payload.changed_fields?.length && !payload.phase_id) {
      for (const field of payload.changed_fields) {
        taskFields.add(field)
      }
    }
    if (taskFields.size > 0) {
      request.taskFields.set(payload.task_id, taskFields)
    }
  }

  if (payload.phase_operation === 'created' || payload.phase_operation === 'deleted') {
    if (payload.phase_id) {
      request.phaseStructureIds.add(payload.phase_id)
      request.phaseOrderChanged = true
    } else if (payload.phase_ids?.length) {
      payload.phase_ids.forEach((id) => request.phaseStructureIds.add(id))
      request.phaseOrderChanged = true
    }
  } else if (payload.phase_operation === 'reordered') {
    request.phaseOrderChanged = true
  }

  if (payload.phase_id) {
    const fields = getRealtimePhaseFields(payload.changed_fields)
    if (fields.length > 0) {
      request.phaseFields.set(payload.phase_id, new Set(fields))
    }
  }

  for (const field of getRealtimeRoadmapFields(payload.roadmap_fields)) {
    request.roadmapFields.add(field)
  }

  if (
    payload.tag_id
    || (payload.tag_ids && payload.tag_ids.length > 0)
    || payload.action?.startsWith('tag.')
    || payload.action === 'tags.reordered'
  ) {
    request.tagChanged = true
  }

  return hasScopedRefresh(request) ? request : null
}

export function eventDedupeKey(payload: RoadmapUpdatedEventPayload): string {
  const taskIds = payload.task_ids
    ? [...payload.task_ids].sort().join(',')
    : (payload.task_id ?? '')
  const phaseIds = payload.phase_ids
    ? [...payload.phase_ids].sort().join(',')
    : (payload.phase_id ?? '')
  const changedFields = payload.changed_fields
    ? [...payload.changed_fields].sort().join(',')
    : ''
  const roadmapFields = payload.roadmap_fields
    ? [...payload.roadmap_fields].sort().join(',')
    : ''

  return [
    payload.roadmap_id ?? '',
    payload.updated_at,
    payload.participant_id,
    payload.action ?? '',
    payload.task_operation ?? '',
    payload.phase_operation ?? '',
    taskIds,
    phaseIds,
    payload.parent_id ?? '',
    payload.dependency_id ?? '',
    changedFields,
    roadmapFields,
  ].join(':')
}
