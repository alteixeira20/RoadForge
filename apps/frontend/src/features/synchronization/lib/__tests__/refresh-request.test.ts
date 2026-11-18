import { describe, expect, it } from 'vitest'
import type { RoadmapUpdatedEventPayload } from '../../services/realtime.service'
import {
  cloneRefreshRequest,
  createRefreshRequest,
  eventDedupeKey,
  hasScopedRefresh,
  mergeRefreshRequest,
  refreshRequestFromEvent,
  taskOrderScopeKey,
} from '../refresh-request'

const event: RoadmapUpdatedEventPayload = {
  roadmap_id: 'rm_example',
  participant_id: 'pt_editor',
  updated_at: '2026-11-18T12:00:00Z',
}

describe('realtime refresh requests', () => {
  it('requests a full refresh when no scope can be inferred', () => {
    expect(hasScopedRefresh(createRefreshRequest())).toBe(false)
    expect(refreshRequestFromEvent(event)).toBeNull()
  })

  it('coalesces focused task and phase scopes while keeping the latest revision', () => {
    const target = createRefreshRequest()
    const completion = refreshRequestFromEvent({
      ...event,
      action: 'task.completed',
      task_id: 'tk_first',
    })!
    const deletion = refreshRequestFromEvent({
      ...event,
      updated_at: '2026-11-18T13:00:00Z',
      task_operation: 'deleted',
      task_ids: ['tk_second'],
      phase_operation: 'deleted',
      phase_id: 'ph_first',
    })!

    mergeRefreshRequest(target, deletion)
    mergeRefreshRequest(target, completion)
    expect([...target.taskFields.get('tk_first')!]).toEqual([
      'done', 'claimedBy', 'claimedById', 'claimedAt',
    ])
    expect(target.deletedTaskIds).toEqual(new Set(['tk_second']))
    expect(target.phaseStructureIds).toEqual(new Set(['ph_first']))
    expect(target.phaseOrderChanged).toBe(true)
    expect(target.maxEventUpdatedAt).toBe(deletion.maxEventUpdatedAt)

    const clone = cloneRefreshRequest(target)
    clone.taskFields.get('tk_first')!.clear()
    clone.deletedTaskIds.clear()
    expect(target.taskFields.get('tk_first')?.size).toBe(4)
    expect(target.deletedTaskIds.has('tk_second')).toBe(true)
  })

  it('distinguishes parent-specific reorder scopes and deduplicates reordered ID arrays', () => {
    const reordered: RoadmapUpdatedEventPayload = {
      ...event,
      phase_id: 'ph_first',
      parent_id: 'tk_parent',
      task_operation: 'reordered',
      task_ids: ['b', 'a'],
    }
    const refresh = refreshRequestFromEvent(reordered)!
    expect(refresh.taskOrderScopes.get(taskOrderScopeKey('ph_first', 'tk_parent'))).toEqual({
      phaseId: 'ph_first', parentId: 'tk_parent',
    })
    expect(refresh.taskOrderScopes.has(taskOrderScopeKey('ph_first', null))).toBe(false)
    expect(eventDedupeKey(reordered)).toBe(eventDedupeKey({ ...reordered, task_ids: ['a', 'b'] }))
    expect(eventDedupeKey(reordered)).not.toBe(eventDedupeKey({ ...reordered, parent_id: null }))
  })
})
