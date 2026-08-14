import { describe, expect, it } from 'vitest'
import {
  createRealtimeRefreshRequest,
  mergeRealtimeRefreshRequest,
  realtimeRefreshRequestFromEvent,
} from '@/lib/realtime-refresh-request'

describe('realtime refresh request scopes', () => {
  it('maps top-level task create into existence and phase-order scopes', () => {
    const request = realtimeRefreshRequestFromEvent({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T14:00:00Z',
      participant_id: 'pt_other',
      action: 'task.created',
      task_operation: 'created',
      task_id: 'task-new',
      phase_id: 'phase-a',
      parent_id: null,
    })

    expect([...request!.taskStructureIds]).toEqual(['task-new'])
    expect([...request!.topLevelTaskOrderPhaseIds]).toEqual(['phase-a'])
    expect(request!.taskIds.size).toBe(0)
  })

  it('maps subtree delete IDs and child-order scope', () => {
    const request = realtimeRefreshRequestFromEvent({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T14:00:00Z',
      participant_id: 'pt_other',
      action: 'task.deleted',
      task_operation: 'deleted',
      task_id: 'child-a',
      task_ids: ['child-a', 'grandchild-a'],
      phase_id: 'phase-a',
      parent_id: 'root',
    })

    expect([...request!.taskStructureIds]).toEqual(['child-a', 'grandchild-a'])
    expect([...request!.childTaskOrderParentIds]).toEqual(['root'])
    expect(request!.topLevelTaskOrderPhaseIds.size).toBe(0)
  })

  it('maps dependency events to deps-only scope instead of whole-task scope', () => {
    const request = realtimeRefreshRequestFromEvent({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T14:00:00Z',
      participant_id: 'pt_other',
      action: 'task.dependency.linked',
      task_id: 'task-a',
      dependency_id: 'task-b',
      phase_id: 'phase-a',
      changed_fields: ['deps'],
    })

    expect([...request!.taskDependencyIds]).toEqual(['task-a'])
    expect(request!.taskIds.size).toBe(0)
  })

  it('coalesces delete and stale task-field scopes without losing either explanation', () => {
    const target = realtimeRefreshRequestFromEvent({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T14:00:00Z',
      participant_id: 'pt_other',
      action: 'task.updated',
      task_id: 'task-a',
      phase_id: 'phase-a',
      changed_fields: ['title'],
    })!
    const deletion = realtimeRefreshRequestFromEvent({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T14:01:00Z',
      participant_id: 'pt_other',
      action: 'task.deleted',
      task_operation: 'deleted',
      task_id: 'task-a',
      task_ids: ['task-a'],
      phase_id: 'phase-a',
      parent_id: null,
    })!

    mergeRealtimeRefreshRequest(target, deletion)

    expect([...target.taskIds]).toEqual(['task-a'])
    expect([...target.taskStructureIds]).toEqual(['task-a'])
    expect([...target.topLevelTaskOrderPhaseIds]).toEqual(['phase-a'])
  })

  it('keeps full refresh dominant while retaining scoped metadata for coalescing', () => {
    const full = createRealtimeRefreshRequest(true)
    const scoped = realtimeRefreshRequestFromEvent({
      roadmap_id: 'rm_1',
      updated_at: '2026-08-14T14:00:00Z',
      participant_id: 'pt_other',
      action: 'task.reordered',
      task_operation: 'reordered',
      phase_id: 'phase-a',
      task_ids: ['b', 'a'],
    })!

    mergeRealtimeRefreshRequest(full, scoped)

    expect(full.full).toBe(true)
    expect([...full.topLevelTaskOrderPhaseIds]).toEqual(['phase-a'])
  })
})
