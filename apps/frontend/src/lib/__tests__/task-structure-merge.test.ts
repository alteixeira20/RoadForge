import { describe, expect, it } from 'vitest'
import {
  addTaskToPhase,
  mergeCreatedTaskAcknowledgement,
  mergeTaskDependencyAcknowledgement,
  orderDirectSubtasksByPreference,
  orderTopLevelTasksByPreference,
  removeTaskSubtreeAndDependencies,
  restoreDeletedTaskSubtree,
  setLocalTaskDependency,
} from '@/lib/task-structure-merge'
import type { Phase, Task } from '@/types/roadmap'

const rootA: Task = {
  id: 'root-a',
  title: 'Root A local',
  done: false,
  deps: [],
  desc: 'keep root draft',
}
const childA: Task = {
  id: 'child-a',
  title: 'Child A local',
  done: false,
  parentId: 'root-a',
  deps: [],
}
const grandchildA: Task = {
  id: 'grandchild-a',
  title: 'Grandchild A local',
  done: false,
  parentId: 'child-a',
  deps: [],
}
const rootB: Task = {
  id: 'root-b',
  title: 'Root B local',
  done: false,
  deps: ['root-a', 'child-a'],
  desc: 'surviving dirty draft',
}
const phaseA: Phase = {
  id: 'phase-a',
  num: '01',
  name: 'Alpha',
  color: '#111111',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [rootA, childA, grandchildA, rootB],
}

function phase(tasks: Task[]): Phase[] {
  return [{ ...phaseA, tasks }]
}

describe('task structure merge helpers', () => {
  it('adds a subtask immediately after its parent without replacing existing tasks', () => {
    const created: Task = {
      id: 'child-new',
      title: 'New child',
      done: false,
      parentId: 'root-a',
    }

    const next = addTaskToPhase([phaseA], 'phase-a', created)

    expect(next[0].tasks.map((task) => task.id)).toEqual([
      'root-a',
      'child-new',
      'child-a',
      'grandchild-a',
      'root-b',
    ])
    expect(next[0].tasks.find((task) => task.id === 'root-b')).toBe(rootB)
  })

  it('removes a task subtree and every dependency edge that points into it', () => {
    const next = removeTaskSubtreeAndDependencies([phaseA], 'root-a')

    expect(next[0].tasks.map((task) => task.id)).toEqual(['root-b'])
    expect(next[0].tasks[0]).toEqual(expect.objectContaining({
      title: 'Root B local',
      desc: 'surviving dirty draft',
      deps: [],
    }))
  })

  it('orders top-level tasks as subtree blocks and retains local-only roots', () => {
    const localOnly: Task = {
      id: 'root-local',
      title: 'Pending local root',
      done: false,
    }
    const next = orderTopLevelTasksByPreference(
      phase([...phaseA.tasks, localOnly]),
      'phase-a',
      ['root-b', 'root-a'],
    )

    expect(next[0].tasks.map((task) => task.id)).toEqual([
      'root-b',
      'root-a',
      'child-a',
      'grandchild-a',
      'root-local',
    ])
    expect(next[0].tasks.find((task) => task.id === 'root-a')?.desc).toBe('keep root draft')
  })

  it('orders direct subtasks with nested descendants attached to each child root', () => {
    const childB: Task = {
      id: 'child-b',
      title: 'Child B',
      done: false,
      parentId: 'root-a',
    }
    const grandchildB: Task = {
      id: 'grandchild-b',
      title: 'Grandchild B',
      done: false,
      parentId: 'child-b',
    }
    const next = orderDirectSubtasksByPreference(
      phase([rootA, childA, grandchildA, childB, grandchildB, rootB]),
      'root-a',
      ['child-b', 'child-a'],
    )

    expect(next[0].tasks.map((task) => task.id)).toEqual([
      'root-a',
      'child-b',
      'grandchild-b',
      'child-a',
      'grandchild-a',
      'root-b',
    ])
  })

  it('changes only one dependency edge optimistically', () => {
    const linked = setLocalTaskDependency([phaseA], 'root-a', 'root-b', true)
    expect(linked[0].tasks[0].deps).toEqual(['root-b'])
    expect(linked[0].tasks.find((task) => task.id === 'root-b')).toBe(rootB)

    const unlinked = setLocalTaskDependency(linked, 'root-a', 'root-b', false)
    expect(unlinked[0].tasks[0].deps).toEqual([])
  })

  it('reconciles a create acknowledgement without overwriting newer local task fields', () => {
    const localCreated: Task = {
      id: 'new-task',
      title: 'Immediate local rename',
      done: false,
      desc: 'local description',
    }
    const serverCreated: Task = {
      id: 'new-task',
      title: 'New task',
      done: false,
      desc: '',
    }
    const local = phase([rootA, localCreated, rootB])
    const server = phase([rootA, rootB, serverCreated])

    const next = mergeCreatedTaskAcknowledgement(local, server, 'new-task')

    expect(next?.[0].tasks.map((task) => task.id)).toEqual(['root-a', 'root-b', 'new-task'])
    expect(next?.[0].tasks[2]).toEqual(expect.objectContaining({
      title: 'Immediate local rename',
      desc: 'local description',
    }))
  })

  it('merges only authoritative dependencies and preserves other dirty fields', () => {
    const server = phase([{ ...rootA, title: 'Server stale title', deps: ['root-b'] }, rootB])
    const next = mergeTaskDependencyAcknowledgement([phaseA], server, 'root-a')

    const merged = next?.[0].tasks.find((task) => task.id === 'root-a')
    expect(merged).toEqual(expect.objectContaining({
      title: 'Root A local',
      desc: 'keep root draft',
      deps: ['root-b'],
    }))
  })

  it('restores a rejected deletion without overwriting newer surviving edits', () => {
    const deleted = removeTaskSubtreeAndDependencies([phaseA], 'root-a')
    const current = phase([{
      ...deleted[0].tasks[0],
      title: 'Root B newer edit',
      deps: ['some-new-edge'],
    }])

    const restored = restoreDeletedTaskSubtree(current, [phaseA], 'root-a')

    expect(restored[0].tasks.map((task) => task.id)).toEqual([
      'root-a',
      'child-a',
      'grandchild-a',
      'root-b',
    ])
    const surviving = restored[0].tasks.find((task) => task.id === 'root-b')!
    expect(surviving.title).toBe('Root B newer edit')
    expect(new Set(surviving.deps)).toEqual(new Set(['some-new-edge', 'root-a', 'child-a']))
  })
})
