import { describe, expect, it } from 'vitest'
import {
  mergeAuthoritativeTaskDependenciesIntoLocalPhases,
  mergeAuthoritativeTaskStructureIntoLocalPhases,
} from '@/lib/realtime-task-structure-merge'
import type { Phase, Task } from '@/types/roadmap'

function task(id: string, title: string, extras: Partial<Task> = {}): Task {
  return {
    id,
    title,
    done: false,
    complexity: 'medium',
    deps: [],
    ...extras,
  }
}

function phase(id: string, tasks: Task[]): Phase {
  return {
    id,
    num: id === 'phase-a' ? '01' : '02',
    name: id === 'phase-a' ? 'Alpha local' : 'Beta local',
    color: '#111111',
    colorMode: 'auto',
    status: id === 'phase-a' ? 'active' : 'future',
    progress: 0,
    tasks,
  }
}

describe('realtime task structure merge', () => {
  it('adds a remote task without replacing unrelated dirty task or phase fields', () => {
    const local = [
      phase('phase-a', [task('a', 'A dirty')]),
      phase('phase-b', [task('b', 'B dirty', { desc: 'preserve me' })]),
    ]
    const remote = [
      { ...phase('phase-a', [task('a', 'A server'), task('c', 'C server')]), name: 'Alpha server' },
      { ...phase('phase-b', [task('b', 'B server')]), name: 'Beta server' },
    ]

    const merged = mergeAuthoritativeTaskStructureIntoLocalPhases(
      local,
      remote,
      new Set(['c']),
      new Set(['phase-a']),
      new Set(),
    )

    expect(merged).not.toBeNull()
    expect(merged![0].name).toBe('Alpha local')
    expect(merged![0].tasks.map((item) => item.id)).toEqual(['a', 'c'])
    expect(merged![0].tasks.find((item) => item.id === 'a')?.title).toBe('A dirty')
    expect(merged![0].tasks.find((item) => item.id === 'c')?.title).toBe('C server')
    expect(merged![1].tasks[0].desc).toBe('preserve me')
  })

  it('removes only final-absent deleted task IDs and cleans surviving dependencies', () => {
    const local = [
      phase('phase-a', [
        task('root', 'Root dirty'),
        task('child', 'Child dirty', { parentId: 'root' }),
      ]),
      phase('phase-b', [task('survivor', 'Survivor dirty', { deps: ['root', 'child'] })]),
    ]
    const remote = [
      phase('phase-a', []),
      phase('phase-b', [task('survivor', 'Survivor server', { deps: [] })]),
    ]

    const merged = mergeAuthoritativeTaskStructureIntoLocalPhases(
      local,
      remote,
      new Set(['root', 'child']),
      new Set(['phase-a']),
      new Set(),
    )

    expect(merged).not.toBeNull()
    expect(merged!.flatMap((item) => item.tasks).map((item) => item.id)).toEqual(['survivor'])
    expect(merged![1].tasks[0].title).toBe('Survivor dirty')
    expect(merged![1].tasks[0].deps).toEqual([])
  })

  it('uses final server existence for delete then recreate bursts', () => {
    const local = [phase('phase-a', [task('x', 'Old local')])]
    const remote = [phase('phase-a', [task('x', 'Recreated server')])]

    const merged = mergeAuthoritativeTaskStructureIntoLocalPhases(
      local,
      remote,
      new Set(['x']),
      new Set(['phase-a']),
      new Set(),
    )

    expect(merged?.[0].tasks).toEqual([expect.objectContaining({
      id: 'x',
      title: 'Recreated server',
    })])
  })

  it('applies authoritative top-level order while preserving a local-only pending create', () => {
    const local = [phase('phase-a', [
      task('a', 'A dirty'),
      task('b', 'B dirty'),
      task('pending', 'Pending local'),
    ])]
    const remote = [phase('phase-a', [task('b', 'B server'), task('a', 'A server')])]

    const merged = mergeAuthoritativeTaskStructureIntoLocalPhases(
      local,
      remote,
      new Set(),
      new Set(['phase-a']),
      new Set(),
    )

    expect(merged?.[0].tasks.map((item) => item.id)).toEqual(['b', 'a', 'pending'])
    expect(merged?.[0].tasks.find((item) => item.id === 'a')?.title).toBe('A dirty')
  })

  it('applies authoritative direct-child order while preserving a local-only child', () => {
    const local = [phase('phase-a', [
      task('root', 'Root dirty'),
      task('child-a', 'A dirty', { parentId: 'root' }),
      task('child-b', 'B dirty', { parentId: 'root' }),
      task('pending-child', 'Pending child', { parentId: 'root' }),
    ])]
    const remote = [phase('phase-a', [
      task('root', 'Root server'),
      task('child-b', 'B server', { parentId: 'root' }),
      task('child-a', 'A server', { parentId: 'root' }),
    ])]

    const merged = mergeAuthoritativeTaskStructureIntoLocalPhases(
      local,
      remote,
      new Set(),
      new Set(),
      new Set(['root']),
    )

    expect(merged?.[0].tasks.map((item) => item.id)).toEqual([
      'root',
      'child-b',
      'child-a',
      'pending-child',
    ])
  })

  it('merges only dependency arrays for dependency events', () => {
    const local = [phase('phase-a', [task('a', 'A dirty', {
      desc: 'dirty description',
      deps: [],
    })])]
    const remote = [phase('phase-a', [task('a', 'A server', {
      desc: 'server description',
      deps: ['dep'],
    }), task('dep', 'Dependency')])]

    const merged = mergeAuthoritativeTaskDependenciesIntoLocalPhases(
      local,
      remote,
      ['a'],
    )

    expect(merged?.[0].tasks[0]).toEqual(expect.objectContaining({
      title: 'A dirty',
      desc: 'dirty description',
      deps: ['dep'],
    }))
  })
})
