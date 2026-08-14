import { describe, expect, it } from 'vitest'
import { mergeAuthoritativeTasksIntoLocalPhases } from '@/lib/realtime-task-merge'
import type { Phase } from '@/types/roadmap'

function makePhase(): Phase {
  return {
    id: 'phase-1',
    num: '01',
    name: 'Local phase name',
    color: '#76746e',
    colorMode: 'auto',
    status: 'active',
    progress: 0,
    tasks: [
      {
        id: 'task-1',
        title: 'Shared task',
        done: false,
        complexity: 'medium',
        tags: [],
        deps: [],
      },
      {
        id: 'task-local',
        title: 'Unsaved local task',
        done: false,
        complexity: 'medium',
        tags: ['local-only'],
        deps: [],
      },
    ],
  }
}

describe('mergeAuthoritativeTasksIntoLocalPhases', () => {
  it('rebases a remote completion without replacing unrelated local edits', () => {
    const local = [makePhase()]
    const server: Phase[] = [{
      ...makePhase(),
      name: 'Server phase name',
      tasks: [
        {
          ...makePhase().tasks[0],
          done: true,
          claimedBy: 'Sam',
          claimedById: 'pt_sam',
          claimedAt: '2026-08-14T08:00:00Z',
        },
      ],
    }]

    const merged = mergeAuthoritativeTasksIntoLocalPhases(local, server, ['task-1'])

    expect(merged).not.toBeNull()
    expect(merged?.[0].name).toBe('Local phase name')
    expect(merged?.[0].tasks).toHaveLength(2)
    expect(merged?.[0].tasks[0]).toMatchObject({
      id: 'task-1',
      done: true,
      claimedBy: 'Sam',
      claimedById: 'pt_sam',
    })
    expect(merged?.[0].tasks[1]).toEqual(local[0].tasks[1])
    expect(merged?.[0].progress).toBe(50)
  })

  it('rebases multiple task events from one authoritative snapshot', () => {
    const local = [makePhase()]
    const server: Phase[] = [{
      ...makePhase(),
      tasks: [
        { ...makePhase().tasks[0], title: 'Renamed remotely' },
        { ...makePhase().tasks[1], done: true },
      ],
    }]

    const merged = mergeAuthoritativeTasksIntoLocalPhases(
      local,
      server,
      ['task-1', 'task-local'],
    )

    expect(merged?.[0].tasks[0].title).toBe('Renamed remotely')
    expect(merged?.[0].tasks[1].done).toBe(true)
    expect(merged?.[0].progress).toBe(50)
  })

  it('refuses to advance when a requested task cannot be reconciled', () => {
    const local = [makePhase()]
    const server: Phase[] = [{ ...makePhase(), tasks: [makePhase().tasks[0]] }]

    expect(
      mergeAuthoritativeTasksIntoLocalPhases(local, server, ['task-missing']),
    ).toBeNull()
  })
})
