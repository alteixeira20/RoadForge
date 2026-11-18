import { describe, expect, it } from 'vitest'
import {
  normalizePortableRoadmapForImport,
  toPortablePhases,
} from '@/lib/portable-roadmap'
import type { Phase } from '@/types/roadmap'

const phases: Phase[] = [
  {
    id: 'phase-1',
    num: '01',
    name: 'Foundation',
    color: '#f97316',
    status: 'done',
    progress: 100,
    tasks: [
      {
        id: 'internal-a',
        title: 'Foundation task',
        done: true,
        claimedBy: 'Transient User',
        claimedById: 'participant-secret',
        claimedAt: '2026-08-12T12:00:00.000Z',
      },
    ],
  },
  {
    id: 'phase-2',
    num: '02',
    name: 'Build',
    color: '#38bdf8',
    status: 'active',
    progress: 0,
    tasks: [
      {
        id: 'internal-b',
        title: 'Build task',
        done: false,
        next: true,
        deps: ['internal-a'],
      },
      {
        id: 'internal-child',
        title: 'Build subtask',
        done: false,
        parentId: 'internal-b',
        deps: ['internal-a', 'internal-b'],
      },
    ],
  },
]

describe('portable roadmap v2', () => {
  it('uses order-derived refs and never serializes internal task identity or claims', () => {
    const portable = toPortablePhases(phases)
    const foundation = portable[0].tasks[0]
    const build = portable[1].tasks[0]
    const child = portable[1].tasks[1]

    expect(foundation).not.toHaveProperty('id')
    expect(foundation).not.toHaveProperty('claimedBy')
    expect(foundation).not.toHaveProperty('claimedById')
    expect(foundation).not.toHaveProperty('claimedAt')
    expect(foundation.complexity).toBe('medium')
    expect(build).toMatchObject({
      title: 'Build task',
      complexity: 'medium',
      recommended: true,
      deps: ['1.1'],
    })
    expect(child).toMatchObject({
      parent: '2.1',
      deps: ['1.1', '2.1'],
    })
  })

  it('overwrites attempted custom task IDs and resolves cross-phase refs', () => {
    const normalized = normalizePortableRoadmapForImport({
      schema: 'roadforge.roadmap.import',
      version: 2,
      phases: [
        {
          id: 'phase-1', num: '01', name: 'One', color: '#000', status: 'done', progress: 100,
          tasks: [{ id: 'CUSTOM-ID-A', title: 'A', done: true }],
        },
        {
          id: 'phase-2', num: '02', name: 'Two', color: '#111', status: 'active', progress: 0,
          tasks: [
            { id: 'CUSTOM-ID-B', title: 'B', done: false, recommended: true, deps: ['1.1'] },
            { id: 'CUSTOM-ID-C', title: 'C', done: false, parent: '2.1', deps: ['1.1', '2.1'] },
          ],
        },
      ],
    }) as {
      phases: Array<{ tasks: Array<Record<string, unknown>> }>
    }

    const a = normalized.phases[0].tasks[0]
    const b = normalized.phases[1].tasks[0]
    const c = normalized.phases[1].tasks[1]

    expect(a.id).toBe('rf-t-v2-1-1')
    expect(b.id).toBe('rf-t-v2-2-1')
    expect(c.id).toBe('rf-t-v2-2-2')
    expect(String(a.id)).not.toContain('CUSTOM')
    expect(String(b.id)).not.toContain('CUSTOM')
    expect(String(c.id)).not.toContain('CUSTOM')
    expect(b.next).toBe(true)
    expect(b).not.toHaveProperty('recommended')
    expect(b.deps).toEqual(['rf-t-v2-1-1'])
    expect(c.parentId).toBe('rf-t-v2-2-1')
    expect(c.deps).toEqual(['rf-t-v2-1-1', 'rf-t-v2-2-1'])
  })

  it('leaves legacy v1 ID-based payloads untouched for compatibility', () => {
    const legacy = {
      schema: 'roadforge.roadmap.import',
      version: 1,
      phases: [{ tasks: [{ id: 'RF-101', title: 'Legacy', done: false }] }],
    }

    expect(normalizePortableRoadmapForImport(legacy)).toBe(legacy)
  })
})
