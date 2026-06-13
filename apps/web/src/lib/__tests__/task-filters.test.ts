import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTER_STATE,
  filterTasks,
  isFilterStateActive,
  taskMatchesFilters,
} from '@/lib/task-filters'
import type { FilterState, Phase, Task } from '@/types/roadmap'

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'RF-1',
  title: 'Build API',
  done: false,
  tags: ['backend'],
  assignees: ['Ada'],
  ...overrides,
})

const phase = (tasks: Task[]): Phase => ({
  id: 'phase-1',
  num: '01',
  name: 'Foundation',
  color: '#2563eb',
  status: 'active',
  progress: 0,
  tasks,
})

const context = {
  displayName: 'Ada',
  participantId: 'pt_ada',
  tagLabels: new Map([['backend', 'Backend Services']]),
}

const filters = (overrides: Partial<FilterState>): FilterState => ({
  ...DEFAULT_FILTER_STATE,
  ...overrides,
})

describe('task filters', () => {
  it('combines status, assignee, tag, claim, and recommendation filters', () => {
    const candidate = task({
      next: true,
      claimedBy: 'Ada',
      claimedById: 'pt_ada',
    })

    expect(taskMatchesFilters(candidate, phase([candidate]), filters({
      status: 'open',
      assignees: ['__mine__'],
      tags: ['backend'],
      claim: 'mine',
      recommended: true,
    }), context)).toBe(true)
  })

  it('searches task text, phase names, assignees, tag IDs, and tag labels', () => {
    const candidate = task()
    const candidatePhase = phase([candidate])

    for (const query of ['api', 'foundation', 'ada', 'backend', 'services']) {
      expect(taskMatchesFilters(
        candidate,
        candidatePhase,
        filters({ query }),
        context,
      )).toBe(true)
    }
  })

  it('preserves phase order while removing phases without matches', () => {
    const result = filterTasks(
      [phase([task({ id: 'RF-1' })]), { ...phase([task({ id: 'RF-2', done: true })]), id: 'phase-2' }],
      filters({ status: 'done' }),
      context,
    )

    expect(result.map((item) => item.id)).toEqual(['phase-2'])
    expect(result[0].tasks.map((item) => item.id)).toEqual(['RF-2'])
  })

  it('recognizes default and active states', () => {
    expect(isFilterStateActive(DEFAULT_FILTER_STATE)).toBe(false)
    expect(isFilterStateActive(filters({ tags: ['backend'] }))).toBe(true)
  })

  it('uses OR within assignee and tag categories', () => {
    const candidate = task({ assignees: ['Ada'], tags: ['backend'] })
    const candidatePhase = phase([candidate])

    expect(taskMatchesFilters(candidate, candidatePhase, filters({
      assignees: ['Grace', 'Ada'],
      tags: ['frontend', 'backend'],
    }), context)).toBe(true)
  })

  it('filters phases before task matching', () => {
    const first = phase([task({ id: 'RF-1' })])
    const second = { ...phase([task({ id: 'RF-2' })]), id: 'phase-2' }

    expect(filterTasks(
      [first, second],
      filters({ phaseIds: ['phase-2'] }),
      context,
    ).map((item) => item.id)).toEqual(['phase-2'])
  })
})
