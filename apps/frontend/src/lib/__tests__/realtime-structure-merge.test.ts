import { describe, expect, it } from 'vitest'
import {
  getRealtimePhaseFields,
  getRealtimeRoadmapFields,
  mergeAuthoritativePhaseFieldsIntoLocalPhases,
  type RealtimePhaseField,
} from '@/lib/realtime-structure-merge'
import type { Phase } from '@/types/roadmap'

function makePhase(): Phase {
  return {
    id: 'phase-1',
    num: '01',
    name: 'Local phase name',
    color: '#111111',
    colorMode: 'auto',
    status: 'active',
    progress: 0,
    tasks: [
      {
        id: 'task-1',
        title: 'Unsaved local task title',
        done: false,
        complexity: 'medium',
        tags: ['local-only'],
        deps: [],
      },
    ],
  }
}

function fieldMap(...fields: RealtimePhaseField[]) {
  return new Map<string, ReadonlySet<RealtimePhaseField>>([
    ['phase-1', new Set(fields)],
  ])
}

describe('realtime structure merge', () => {
  it('filters event metadata to the supported focused fields', () => {
    expect(getRealtimePhaseFields(['name', 'progress', 'color', 'name'])).toEqual([
      'name',
      'color',
    ])
    expect(getRealtimeRoadmapFields(['name', 'owner', 'name'])).toEqual(['name'])
  })

  it('rebases only authoritative phase fields and preserves unrelated local edits', () => {
    const local = [makePhase()]
    const server: Phase[] = [{
      ...makePhase(),
      name: 'Server phase name',
      color: '#abcdef',
      colorMode: 'manual',
      tasks: [{
        ...makePhase().tasks[0],
        title: 'Server task title that must not replace the local draft',
        done: true,
      }],
    }]

    const merged = mergeAuthoritativePhaseFieldsIntoLocalPhases(
      local,
      server,
      fieldMap('name', 'color', 'colorMode'),
    )

    expect(merged).not.toBeNull()
    expect(merged?.[0]).toMatchObject({
      name: 'Server phase name',
      color: '#abcdef',
      colorMode: 'manual',
    })
    expect(merged?.[0].tasks).toEqual(local[0].tasks)
    expect(merged?.[0].status).toBe(local[0].status)
  })

  it('leaves phase fields outside the event scope untouched', () => {
    const local = [makePhase()]
    const server: Phase[] = [{
      ...makePhase(),
      name: 'Server name',
      color: '#abcdef',
      colorMode: 'manual',
    }]

    const merged = mergeAuthoritativePhaseFieldsIntoLocalPhases(
      local,
      server,
      fieldMap('name'),
    )

    expect(merged?.[0].name).toBe('Server name')
    expect(merged?.[0].color).toBe('#111111')
    expect(merged?.[0].colorMode).toBe('auto')
  })

  it('refuses to claim a successful rebase when a requested phase is missing', () => {
    const local = [makePhase()]
    const requested = new Map<string, ReadonlySet<RealtimePhaseField>>([
      ['missing-phase', new Set(['name'])],
    ])

    expect(
      mergeAuthoritativePhaseFieldsIntoLocalPhases(local, [makePhase()], requested),
    ).toBeNull()
  })
})
