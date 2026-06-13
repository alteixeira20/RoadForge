import { describe, it, expect } from 'vitest'
import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'
import type { ImportedRoadmap } from '@/lib/roadmap-validation'
import { indexRoadmap } from '@/lib/import-merge/indexRoadmap'
import { matchPhase, matchTask } from '@/lib/import-merge/matchRoadmaps'
import { applySafeAdditions } from '@/lib/import-merge/mergeRoadmaps'
import { buildBasicPreview } from '@/lib/import-merge/previewImport'
import type { Phase, Task } from '@/types/roadmap'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return { id: 't1', title: 'Task One', done: false, ...overrides }
}

function makePhase(overrides: Partial<Phase> = {}): Phase {
  return {
    id: 'p1',
    num: '01',
    name: 'Phase One',
    color: '#808080',
    status: 'active',
    progress: 0,
    tasks: [],
    ...overrides,
  }
}

const malformedInput = JSON.stringify({
  phases: [
    {
      // missing id → repair generates rf-p-1
      num: '01',
      name: 'Phase One',
      color: '#808080',
      status: 'active',
      progress: 'bad', // invalid → recalculated
      tasks: [
        { title: 'No ID task', done: 'yes' }, // missing id → rf-t-1; done coerced
        { title: 'Also no id', done: false },  // missing id → rf-t-2
      ],
    },
  ],
})

// ─── 2002+2003: Deterministic repair IDs ──────────────────────────────────────

describe('parseImportedRoadmapJson: deterministic repair IDs', () => {
  it('generates the same phase IDs on repeated calls', () => {
    const a = parseImportedRoadmapJson(malformedInput)
    const b = parseImportedRoadmapJson(malformedInput)
    expect(a.phases[0].id).toBe('rf-p-1')
    expect(b.phases[0].id).toBe('rf-p-1')
  })

  it('generates the same task IDs on repeated calls', () => {
    const a = parseImportedRoadmapJson(malformedInput)
    const b = parseImportedRoadmapJson(malformedInput)
    expect(a.phases[0].tasks[0].id).toBe('rf-t-1')
    expect(a.phases[0].tasks[1].id).toBe('rf-t-2')
    expect(b.phases[0].tasks[0].id).toBe(a.phases[0].tasks[0].id)
    expect(b.phases[0].tasks[1].id).toBe(a.phases[0].tasks[1].id)
  })

  it('generates the same repair summary on repeated calls', () => {
    const a = parseImportedRoadmapJson(malformedInput)
    const b = parseImportedRoadmapJson(malformedInput)
    const aCodes = a.repairs.map((r) => r.code).sort()
    const bCodes = b.repairs.map((r) => r.code).sort()
    expect(aCodes).toEqual(bCodes)
  })

  it('does not leak seq across independent parse calls', () => {
    // Parse once to advance the (former global) seq
    parseImportedRoadmapJson(malformedInput)
    const c = parseImportedRoadmapJson(malformedInput)
    // Still starts at rf-t-1, not rf-t-3 or higher
    expect(c.phases[0].tasks[0].id).toBe('rf-t-1')
  })
})

// ─── 2004: Entity indexing ─────────────────────────────────────────────────────

describe('indexRoadmap', () => {
  it('indexes phases by ID', () => {
    const phase = makePhase({ id: 'p-alpha' })
    const idx = indexRoadmap([phase])
    expect(idx.phaseById.get('p-alpha')).toBe(phase)
  })

  it('indexes tasks by ID globally', () => {
    const task = makeTask({ id: 't-alpha' })
    const phase = makePhase({ tasks: [task] })
    const idx = indexRoadmap([phase])
    expect(idx.taskById.get('t-alpha')?.task).toBe(task)
    expect(idx.taskById.get('t-alpha')?.phase).toBe(phase)
  })

  it('indexes phases by normalized name for fallback', () => {
    const phase = makePhase({ id: 'p1', name: '  Phase One ' })
    const idx = indexRoadmap([phase])
    expect(idx.phasesByNormalizedName.get('phase one')).toEqual([phase])
  })

  it('indexes tasks by phase+title for fallback', () => {
    const task = makeTask({ id: 't1', title: '  My Task ' })
    const phase = makePhase({ id: 'p1', tasks: [task] })
    const idx = indexRoadmap([phase])
    const key = 'p1:my task'
    expect(idx.tasksByPhaseAndTitle.get(key)).toHaveLength(1)
    expect(idx.tasksByPhaseAndTitle.get(key)?.[0].task).toBe(task)
  })

  it('marks ambiguous phase names by holding multiple phases', () => {
    const p1 = makePhase({ id: 'p1', name: 'Alpha' })
    const p2 = makePhase({ id: 'p2', name: 'Alpha' })
    const idx = indexRoadmap([p1, p2])
    expect(idx.phasesByNormalizedName.get('alpha')).toHaveLength(2)
  })
})

// ─── 2005: ID-first matching with safe fallbacks ───────────────────────────────

describe('matchPhase', () => {
  it('matches by ID when ID exists', () => {
    const phase = makePhase({ id: 'p1', name: 'Different Name' })
    const idx = indexRoadmap([phase])
    const result = matchPhase(makePhase({ id: 'p1', name: 'Whatever' }), idx)
    expect(result.strategy).toBe('id')
    expect(result.current).toBe(phase)
  })

  it('falls back to unique normalized name when no ID match', () => {
    const phase = makePhase({ id: 'p-other', name: 'My Phase' })
    const idx = indexRoadmap([phase])
    const result = matchPhase(makePhase({ id: 'p-new', name: 'My Phase' }), idx)
    expect(result.strategy).toBe('fallback')
    expect(result.current).toBe(phase)
  })

  it('returns no match when fallback name is ambiguous', () => {
    const p1 = makePhase({ id: 'p1', name: 'Alpha' })
    const p2 = makePhase({ id: 'p2', name: 'Alpha' })
    const idx = indexRoadmap([p1, p2])
    const result = matchPhase(makePhase({ id: 'p-new', name: 'Alpha' }), idx)
    expect(result.strategy).toBe('none')
    expect(result.current).toBeNull()
  })

  it('returns no match when neither ID nor name matches', () => {
    const phase = makePhase({ id: 'p1', name: 'Existing' })
    const idx = indexRoadmap([phase])
    const result = matchPhase(makePhase({ id: 'p-new', name: 'Something Else' }), idx)
    expect(result.strategy).toBe('none')
    expect(result.current).toBeNull()
  })
})

describe('matchTask', () => {
  it('matches by ID when ID exists', () => {
    const task = makeTask({ id: 't1', title: 'Different Title' })
    const phase = makePhase({ id: 'p1', tasks: [task] })
    const idx = indexRoadmap([phase])
    const result = matchTask(makeTask({ id: 't1', title: 'Whatever' }), 'p1', idx)
    expect(result.strategy).toBe('id')
    expect(result.current?.task).toBe(task)
  })

  it('falls back to unique title within the matched phase', () => {
    const task = makeTask({ id: 't-other', title: 'My Task' })
    const phase = makePhase({ id: 'p1', tasks: [task] })
    const idx = indexRoadmap([phase])
    const result = matchTask(makeTask({ id: 't-new', title: 'My Task' }), 'p1', idx)
    expect(result.strategy).toBe('fallback')
    expect(result.current?.task).toBe(task)
  })

  it('returns no match when title is ambiguous within the phase', () => {
    const t1 = makeTask({ id: 't1', title: 'Dup' })
    const t2 = makeTask({ id: 't2', title: 'Dup' })
    const phase = makePhase({ id: 'p1', tasks: [t1, t2] })
    const idx = indexRoadmap([phase])
    const result = matchTask(makeTask({ id: 't-new', title: 'Dup' }), 'p1', idx)
    expect(result.strategy).toBe('none')
    expect(result.current).toBeNull()
  })

  it('does not match tasks across phases by title', () => {
    const task = makeTask({ id: 't1', title: 'Cross Task' })
    const p1 = makePhase({ id: 'p1', tasks: [task] })
    const p2 = makePhase({ id: 'p2', tasks: [] })
    const idx = indexRoadmap([p1, p2])
    // Looking up against p2 — task lives in p1
    const result = matchTask(makeTask({ id: 't-new', title: 'Cross Task' }), 'p2', idx)
    expect(result.strategy).toBe('none')
  })
})

// ─── 2006+2008: Safe-additions merge rules ─────────────────────────────────────

describe('applySafeAdditions', () => {
  it('adds an entirely new phase', () => {
    const current = [makePhase({ id: 'p1', name: 'Existing' })]
    const imported = [makePhase({ id: 'p2', name: 'New Phase' })]
    const { phases, preview } = applySafeAdditions(current, imported)
    expect(phases).toHaveLength(2)
    expect(phases[1].id).toBe('p2')
    expect(preview.phasesAdded).toBe(1)
    expect(preview.tasksAdded).toBe(0)
  })

  it('adds new tasks to a matched phase', () => {
    const existingTask = makeTask({ id: 't1', title: 'Existing Task' })
    const current = [makePhase({ id: 'p1', tasks: [existingTask] })]
    const newTask = makeTask({ id: 't2', title: 'New Task' })
    const imported = [makePhase({ id: 'p1', tasks: [existingTask, newTask] })]
    const { phases, preview } = applySafeAdditions(current, imported)
    expect(phases[0].tasks).toHaveLength(2)
    expect(phases[0].tasks.find((t) => t.id === 't2')).toBeDefined()
    expect(preview.tasksAdded).toBe(1)
    expect(preview.matchedTasks).toBe(1)
  })

  it('does not overwrite existing task fields', () => {
    const existingTask = makeTask({ id: 't1', title: 'Task', done: false })
    const current = [makePhase({ id: 'p1', tasks: [existingTask] })]
    const importedTask = makeTask({ id: 't1', title: 'Task', done: true })
    const imported = [makePhase({ id: 'p1', tasks: [importedTask] })]
    const { phases, preview } = applySafeAdditions(current, imported)
    // existing task must not be changed
    expect(phases[0].tasks[0].done).toBe(false)
    expect(preview.skippedCount).toBe(1)
    expect(preview.conflictsCount).toBe(1)
    expect(preview.conflicts[0].type).toBe('task-field-conflict')
  })

  it('records conflict when matched task has different fields', () => {
    const current = [makePhase({ id: 'p1', tasks: [makeTask({ id: 't1', title: 'T', done: false })] })]
    const imported = [makePhase({ id: 'p1', tasks: [makeTask({ id: 't1', title: 'T', done: true })] })]
    const { preview } = applySafeAdditions(current, imported)
    expect(preview.conflicts).toHaveLength(1)
    expect(preview.conflicts[0].importedId).toBe('t1')
  })

  it('preserves current claim and reports differing imported claim metadata', () => {
    const currentTask = makeTask({
      claimedBy: 'Current Editor',
      claimedById: 'pt_current',
      claimedAt: '2026-06-01T10:00:00Z',
    })
    const importedTask = makeTask({
      claimedBy: 'Imported Editor',
      claimedById: 'pt_imported',
      claimedAt: '2026-06-02T10:00:00Z',
    })

    const { phases, preview } = applySafeAdditions(
      [makePhase({ tasks: [currentTask] })],
      [makePhase({ tasks: [importedTask] })],
    )

    expect(phases[0].tasks[0].claimedBy).toBe('Current Editor')
    expect(preview.conflicts).toHaveLength(1)
    expect(preview.conflicts[0].fieldDiffs).toContainEqual({
      field: 'claim',
      current: 'Current Editor since 2026-06-01T10:00:00Z',
      imported: 'Imported Editor since 2026-06-02T10:00:00Z',
    })
  })

  it('skips task ID collisions from another current phase', () => {
    const existingTask = makeTask({ id: 'shared-id', title: 'Original' })
    const current = [
      makePhase({ id: 'p1', name: 'Existing Phase', tasks: [existingTask] }),
      makePhase({ id: 'p2', name: 'Target Phase', tasks: [] }),
    ]
    const imported = [
      makePhase({
        id: 'p2',
        name: 'Target Phase',
        tasks: [makeTask({ id: 'shared-id', title: 'Imported Copy' })],
      }),
    ]

    const { phases, preview } = applySafeAdditions(current, imported)

    expect(phases[0].tasks).toHaveLength(1)
    expect(phases[0].tasks[0]).toMatchObject(existingTask)
    expect(phases[1].tasks).toHaveLength(0)
    expect(preview.tasksAdded).toBe(0)
    expect(preview.matchedTasks).toBe(0)
    expect(preview.skippedCount).toBe(1)
    expect(preview.conflictsCount).toBe(1)
    expect(preview.conflicts[0].type).toBe('id-collision')
  })

  it('filters task ID collisions from newly added phases', () => {
    const existingTask = makeTask({ id: 'shared-id', title: 'Original' })
    const current = [
      makePhase({ id: 'p1', name: 'Existing Phase', tasks: [existingTask] }),
    ]
    const imported = [
      makePhase({
        id: 'p-new',
        name: 'New Phase',
        tasks: [
          makeTask({ id: 'shared-id', title: 'Colliding Copy' }),
          makeTask({ id: 'new-task', title: 'Safe Task' }),
        ],
      }),
      makePhase({
        id: 'p-empty',
        name: 'Only Collisions',
        tasks: [makeTask({ id: 'shared-id', title: 'Another Copy' })],
      }),
    ]

    const { phases, preview } = applySafeAdditions(current, imported)

    expect(phases).toHaveLength(3)
    expect(phases[0].tasks[0]).toMatchObject(existingTask)
    expect(phases[1].tasks.map((t) => t.id)).toEqual(['new-task'])
    expect(phases[2].tasks).toEqual([])
    expect(preview.phasesAdded).toBe(2)
    expect(preview.tasksAdded).toBe(1)
    expect(preview.skippedCount).toBe(2)
    expect(preview.conflicts.map((c) => c.type)).toEqual(['id-collision', 'id-collision'])
  })

  it('does not remove existing phases or tasks', () => {
    const current = [
      makePhase({ id: 'p1', name: 'Keep', tasks: [makeTask({ id: 't1' })] }),
    ]
    const imported = [makePhase({ id: 'p2', name: 'New', tasks: [] })]
    const { phases } = applySafeAdditions(current, imported)
    expect(phases).toHaveLength(2)
    expect(phases[0].id).toBe('p1')
    expect(phases[0].tasks).toHaveLength(1)
  })

  it('appends added phases after existing phases', () => {
    const current = [makePhase({ id: 'p1' })]
    const imported = [makePhase({ id: 'p2', name: 'Added' })]
    const { phases } = applySafeAdditions(current, imported)
    expect(phases[0].id).toBe('p1')
    expect(phases[1].id).toBe('p2')
  })

  it('prunes stale deps in added tasks that reference non-existent tasks', () => {
    const current: Phase[] = []
    const imported = [
      makePhase({
        id: 'p1',
        tasks: [
          makeTask({ id: 't1', title: 'Task', deps: ['nonexistent-id'] }),
        ],
      }),
    ]
    const { phases } = applySafeAdditions(current, imported)
    expect(phases[0].tasks[0].deps).toEqual([])
  })

  it('preserves deps that reference valid task IDs in the merged result', () => {
    const current: Phase[] = []
    const imported = [
      makePhase({
        id: 'p1',
        tasks: [
          makeTask({ id: 't1', title: 'A' }),
          makeTask({ id: 't2', title: 'B', deps: ['t1'] }),
        ],
      }),
    ]
    const { phases } = applySafeAdditions(current, imported)
    expect(phases[0].tasks[1].deps).toEqual(['t1'])
  })

  it('reports no additions when everything already exists', () => {
    const task = makeTask({ id: 't1', title: 'Same', done: false })
    const current = [makePhase({ id: 'p1', tasks: [task] })]
    const imported = [makePhase({ id: 'p1', tasks: [task] })]
    const { preview } = applySafeAdditions(current, imported)
    expect(preview.phasesAdded).toBe(0)
    expect(preview.tasksAdded).toBe(0)
    expect(preview.matchedPhases).toBe(1)
    expect(preview.matchedTasks).toBe(1)
  })

  it('reports a registry-only addition as importable content', () => {
    const phases = [makePhase({ id: 'p1' })]
    const { tagRegistry, preview } = applySafeAdditions(
      phases,
      phases,
      [{ id: 'frontend', label: 'Frontend', color: '#2563eb' }],
      [
        { id: 'frontend', label: 'Frontend', color: '#2563eb' },
        { id: 'backend', label: 'Backend', color: '#16a34a' },
      ],
    )

    expect(preview.phasesAdded).toBe(0)
    expect(preview.tasksAdded).toBe(0)
    expect(preview.tagsAdded).toBe(1)
    expect(tagRegistry.map((tag) => tag.id)).toEqual(['frontend', 'backend'])
  })
})

describe('buildBasicPreview', () => {
  it('summarizes imported content for non-merge import modes', () => {
    const imported: ImportedRoadmap = {
      roadmapName: 'Imported Roadmap',
      phases: [
        makePhase({ id: 'p1', tasks: [makeTask({ id: 't1' })] }),
        makePhase({ id: 'p2', tasks: [makeTask({ id: 't2' }), makeTask({ id: 't3' })] }),
      ],
      tagRegistry: [{ id: 'frontend', label: 'Frontend', color: '#2563eb' }],
      repairs: [{ code: 'generated_required', message: 'Repaired' }],
      warnings: [{ code: 'unknown_fields', message: 'Warned' }],
    }

    const preview = buildBasicPreview(imported, [{ code: 'upgrade', message: 'Upgraded', severity: 'info' }])

    expect(preview.phasesAdded).toBe(2)
    expect(preview.tasksAdded).toBe(3)
    expect(preview.tagsAdded).toBe(1)
    expect(preview.repairsCount).toBe(1)
    expect(preview.warningsCount).toBe(2)
    expect(preview.conflicts).toEqual([])
  })
})
