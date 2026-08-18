import { describe, expect, it } from 'vitest'
import {
  mergeAuthoritativeTaskStructureIntoLocalPhases,
  type RealtimeTaskOrderScope,
} from '@/lib/realtime-task-structure-merge'
import type { Phase, Task } from '@/types/roadmap'

const rootA: Task = {
  id: 'root-a',
  title: 'Root A local draft',
  done: false,
  deps: [],
  desc: 'keep local fields',
}
const rootB: Task = {
  id: 'root-b',
  title: 'Root B local draft',
  done: false,
  deps: [],
}
const phaseA: Phase = {
  id: 'phase-a',
  num: '01',
  name: 'Alpha',
  color: '#111111',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [rootA, rootB],
}

function phase(tasks: Task[]): Phase[] {
  return [{ ...phaseA, tasks }]
}

function scopes(...values: RealtimeTaskOrderScope[]) {
  return new Map(values.map((scope) => [
    `${scope.phaseId}:${scope.parentId ?? 'root'}`,
    scope,
  ]))
}

describe('realtime task structure merge', () => {
  it('adds a remotely created task without overwriting unrelated dirty task fields', () => {
    const created: Task = {
      id: 'root-c',
      title: 'Remote C',
      done: false,
      deps: [],
    }
    const server = phase([
      { ...rootA, title: 'Root A stale server title', desc: 'server description' },
      rootB,
      created,
    ])

    const next = mergeAuthoritativeTaskStructureIntoLocalPhases(
      [phaseA],
      server,
      new Set(['root-c']),
      new Set(),
      new Map(),
    )

    expect(next?.[0].tasks.map((task) => task.id)).toEqual(['root-a', 'root-b', 'root-c'])
    expect(next?.[0].tasks[0]).toEqual(expect.objectContaining({
      title: 'Root A local draft',
      desc: 'keep local fields',
    }))
    expect(next?.[0].tasks[2]).toEqual(created)
  })

  it('removes the explicit remote deletion set, cleans dependencies, and preserves local-only work', () => {
    const child: Task = {
      id: 'child-a',
      title: 'Child A',
      done: false,
      parentId: 'root-a',
      deps: [],
    }
    const localOnlyChild: Task = {
      id: 'child-local',
      title: 'Pending local child',
      done: false,
      parentId: 'root-a',
      deps: [],
    }
    const survivor: Task = {
      ...rootB,
      deps: ['root-a', 'child-a'],
      desc: 'unrelated dirty work',
    }
    const local = phase([rootA, child, localOnlyChild, survivor])
    const server = phase([rootB])

    const next = mergeAuthoritativeTaskStructureIntoLocalPhases(
      local,
      server,
      new Set(),
      new Set(['root-a', 'child-a']),
      new Map(),
    )

    expect(next?.[0].tasks.map((task) => task.id)).toEqual(['child-local', 'root-b'])
    expect(next?.[0].tasks[0].parentId).toBeUndefined()
    expect(next?.[0].tasks[1]).toEqual(expect.objectContaining({
      desc: 'unrelated dirty work',
      deps: [],
    }))
  })

  it('applies final server top-level order while retaining local-only roots and dirty fields', () => {
    const localOnly: Task = {
      id: 'root-local',
      title: 'Pending local root',
      done: false,
    }
    const local = phase([rootA, localOnly, rootB])
    const server = phase([
      { ...rootB, title: 'stale server B' },
      { ...rootA, title: 'stale server A' },
    ])

    const next = mergeAuthoritativeTaskStructureIntoLocalPhases(
      local,
      server,
      new Set(),
      new Set(),
      scopes({ phaseId: 'phase-a', parentId: null }),
    )

    expect(next?.[0].tasks.map((task) => task.id)).toEqual(['root-b', 'root-a', 'root-local'])
    expect(next?.[0].tasks.find((task) => task.id === 'root-a')?.title).toBe('Root A local draft')
  })

  it('applies final server direct-subtask order without replacing local task fields', () => {
    const childA: Task = {
      id: 'child-a',
      title: 'Child A local',
      done: false,
      parentId: 'root-a',
    }
    const childB: Task = {
      id: 'child-b',
      title: 'Child B local',
      done: false,
      parentId: 'root-a',
    }
    const localOnly: Task = {
      id: 'child-local',
      title: 'Local child',
      done: false,
      parentId: 'root-a',
    }
    const local = phase([rootA, childA, localOnly, childB, rootB])
    const server = phase([
      rootA,
      { ...childB, title: 'Child B server' },
      { ...childA, title: 'Child A server' },
      rootB,
    ])

    const next = mergeAuthoritativeTaskStructureIntoLocalPhases(
      local,
      server,
      new Set(),
      new Set(),
      scopes({ phaseId: 'phase-a', parentId: 'root-a' }),
    )

    expect(next?.[0].tasks.map((task) => task.id)).toEqual([
      'root-a',
      'child-b',
      'child-a',
      'child-local',
      'root-b',
    ])
    expect(next?.[0].tasks.find((task) => task.id === 'child-b')?.title).toBe('Child B local')
  })

  it('uses the final server snapshot when a create and delete coalesce', () => {
    const localCollision: Task = {
      id: 'transient',
      title: 'Local collision',
      done: false,
    }
    const next = mergeAuthoritativeTaskStructureIntoLocalPhases(
      phase([rootA, localCollision, rootB]),
      phase([rootA, rootB]),
      new Set(['transient']),
      new Set(['transient']),
      new Map(),
    )

    expect(next?.[0].tasks.map((task) => task.id)).toEqual(['root-a', 'root-b'])
  })

  it('uses the final server snapshot when a delete and recreate coalesce', () => {
    const recreated: Task = {
      id: 'transient',
      title: 'Recreated server task',
      done: false,
    }
    const next = mergeAuthoritativeTaskStructureIntoLocalPhases(
      phase([rootA, rootB]),
      phase([rootA, rootB, recreated]),
      new Set(['transient']),
      new Set(['transient']),
      new Map(),
    )

    expect(next?.[0].tasks.map((task) => task.id)).toEqual(['root-a', 'root-b', 'transient'])
    expect(next?.[0].tasks[2]).toEqual(recreated)
  })
})
