import { describe, expect, it } from 'vitest'
import { createRealtimeRefreshRequest } from '@/lib/realtime-refresh-request'
import { mergeAuthoritativeRealtimeScopes } from '@/lib/realtime-scoped-merge'
import type { Phase, Task } from '@/types/roadmap'

function task(id: string, title: string, extras: Partial<Task> = {}): Task {
  return { id, title, done: false, complexity: 'medium', deps: [], ...extras }
}

function phase(tasks: Task[]): Phase {
  return {
    id: 'phase-a',
    num: '01',
    name: 'Local phase',
    color: '#111111',
    colorMode: 'auto',
    status: 'active',
    progress: 0,
    tasks,
  }
}

describe('authoritative realtime scoped merge', () => {
  it('lets final task deletion supersede an obsolete queued whole-task update', () => {
    const request = createRealtimeRefreshRequest()
    request.taskIds.add('task-a')
    request.taskStructureIds.add('task-a')
    request.topLevelTaskOrderPhaseIds.add('phase-a')

    const merged = mergeAuthoritativeRealtimeScopes({
      localPhases: [phase([task('task-a', 'Dirty A'), task('task-b', 'Dirty B')])],
      localRoadmapName: 'Dirty roadmap',
      serverPhases: [phase([task('task-b', 'Server B')])],
      serverRoadmapName: 'Server roadmap',
      request,
    })

    expect(merged.reconciled).toBe(true)
    expect(merged.phases[0].tasks).toEqual([expect.objectContaining({
      id: 'task-b',
      title: 'Dirty B',
    })])
  })

  it('refuses revision reconciliation for an unexplained missing queued task', () => {
    const request = createRealtimeRefreshRequest()
    request.taskIds.add('missing-task')

    const merged = mergeAuthoritativeRealtimeScopes({
      localPhases: [phase([task('task-a', 'Dirty A')])],
      localRoadmapName: 'Dirty roadmap',
      serverPhases: [phase([task('task-a', 'Server A')])],
      serverRoadmapName: 'Server roadmap',
      request,
    })

    expect(merged.reconciled).toBe(false)
    expect(merged.phases[0].tasks[0].title).toBe('Dirty A')
  })

  it('lets final phase deletion explain a queued task that disappeared with that phase', () => {
    const deletedPhase: Phase = {
      ...phase([task('task-a', 'Dirty A')]),
      id: 'phase-deleted',
      name: 'Deleted local phase',
    }
    const survivingPhase: Phase = {
      ...phase([task('task-b', 'Dirty B')]),
      id: 'phase-survives',
      name: 'Surviving local phase',
    }
    const request = createRealtimeRefreshRequest()
    request.taskIds.add('task-a')
    request.phaseStructureIds.add('phase-deleted')

    const merged = mergeAuthoritativeRealtimeScopes({
      localPhases: [deletedPhase, survivingPhase],
      localRoadmapName: 'Dirty roadmap',
      serverPhases: [{ ...survivingPhase, tasks: [task('task-b', 'Server B')] }],
      serverRoadmapName: 'Server roadmap',
      request,
    })

    expect(merged.reconciled).toBe(true)
    expect(merged.phases.map((item) => item.id)).toEqual(['phase-survives'])
    expect(merged.phases[0].tasks[0].title).toBe('Dirty B')
  })

  it('merges dependency scope without replacing unrelated dirty task fields', () => {
    const request = createRealtimeRefreshRequest()
    request.taskDependencyIds.add('task-a')

    const merged = mergeAuthoritativeRealtimeScopes({
      localPhases: [phase([task('task-a', 'Dirty A', { desc: 'dirty', deps: [] })])],
      localRoadmapName: 'Dirty roadmap',
      serverPhases: [phase([
        task('task-a', 'Server A', { desc: 'server', deps: ['task-b'] }),
        task('task-b', 'Server B'),
      ])],
      serverRoadmapName: 'Server roadmap',
      request,
    })

    expect(merged.reconciled).toBe(true)
    expect(merged.phases[0].tasks[0]).toEqual(expect.objectContaining({
      title: 'Dirty A',
      desc: 'dirty',
      deps: ['task-b'],
    }))
  })
})
