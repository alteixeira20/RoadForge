import { describe, it, expect } from 'vitest'
import { exportRoadmap } from '@/services/roadmap-crud.service'
import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'
import type { Phase, Task, TagDefinition, TaskExternalLink } from '@/types/roadmap'

// ─── Fixture ───────────────────────────────────────────────────────────────────
//
// This fixture is intentionally "maximal": every optional field on Task,
// TagDefinition, and TaskExternalLink is populated with a real value, so the
// round trip through exportRoadmap() -> parseImportedRoadmapJson() exercises
// every field these three types carry today.
//
// Note on links: a single TaskExternalLink cannot realistically have
// `number`, `sha`, and `tag` all populated at once — the importer
// (normalizeLinkRecord in roadmap-validation.ts) re-derives link fields from
// the URL per GitHub route (issue/pull/discussion -> number, commit -> sha,
// release -> tag) and rejects any raw payload whose fields don't exactly
// match what it derives. So instead of one link with every field, this
// fixture uses one link per kind to cover number, sha, tag, owner, repo, and
// label collectively, plus one link with only the required fields (id,
// provider, kind, url) to cover the minimal shape.

const markdownDesc = [
  'Summary paragraph with context for reviewers.',
  '',
  '- First bullet point',
  '- Second bullet point',
  '',
  '- [ ] Pending checklist item',
  '- [x] Completed checklist item',
  '',
  'See the [design doc](https://example.com/design-doc) for details.',
].join('\n')

const issueLink: TaskExternalLink = {
  id: 'link-issue',
  provider: 'github',
  kind: 'issue',
  url: 'https://github.com/anvilary/roadforge/issues/601',
  owner: 'anvilary',
  repo: 'roadforge',
  number: 601,
  label: 'Foundation issue',
}

const commitLink: TaskExternalLink = {
  id: 'link-commit',
  provider: 'github',
  kind: 'commit',
  url: 'https://github.com/anvilary/roadforge/commit/abc1234',
  owner: 'anvilary',
  repo: 'roadforge',
  sha: 'abc1234',
}

const releaseLink: TaskExternalLink = {
  id: 'link-release',
  provider: 'github',
  kind: 'release',
  url: 'https://github.com/anvilary/roadforge/releases/tag/v1.2.0',
  owner: 'anvilary',
  repo: 'roadforge',
  tag: 'v1.2.0',
}

const bareUrlLink: TaskExternalLink = {
  id: 'link-spec',
  provider: 'url',
  kind: 'url',
  url: 'https://example.com/spec',
}

const parentTask: Task = {
  id: 'RF-2',
  title: 'Parent task',
  done: false,
  tags: ['delivery'],
  assignees: [],
  deps: [],
}

const maximalSubtask: Task = {
  id: 'RF-3',
  title: 'Maximal round-trip subtask',
  done: false,
  next: true,
  est: '3d',
  assignees: ['Alex', 'Sam'],
  tags: ['delivery', 'frontend'],
  deps: ['RF-2'],
  desc: markdownDesc,
  parentId: 'RF-2',
  claimedBy: 'Alex',
  claimedById: 'pt_alex',
  claimedAt: '2026-07-03T09:00:00.000Z',
  links: [issueLink, commitLink, releaseLink, bareUrlLink],
} satisfies Required<Task>

const phases: Phase[] = [
  {
    id: 'phase-1',
    num: '01',
    name: 'Implementation',
    color: '#38bdf8',
    status: 'active',
    progress: 50,
    tasks: [parentTask, maximalSubtask],
  },
]

const tagRegistry: TagDefinition[] = [
  { id: 'delivery', label: 'Delivery', color: '#38bdf8' },
  {
    id: 'frontend',
    label: 'Frontend',
    color: '#a78bfa',
    createdAt: '2026-01-05T08:00:00.000Z',
    updatedAt: '2026-06-01T12:30:00.000Z',
  },
]

// ─── Compile-time field canary ─────────────────────────────────────────────────
//
// If Task/TagDefinition/TaskExternalLink gain a field here without updating
// the round-trip fixture above, typecheck fails — forcing this test to be
// revisited.

const _ALL_TASK_FIELDS: Record<keyof Task, true> = {
  id: true, title: true, done: true, next: true, est: true, assignees: true,
  tags: true, deps: true, desc: true, parentId: true, claimedBy: true,
  claimedById: true, claimedAt: true, links: true,
}
void _ALL_TASK_FIELDS

const _ALL_TAG_FIELDS: Record<keyof TagDefinition, true> = {
  id: true, label: true, color: true, createdAt: true, updatedAt: true,
}
void _ALL_TAG_FIELDS

const _ALL_LINK_FIELDS: Record<keyof TaskExternalLink, true> = {
  id: true, provider: true, kind: true, url: true, owner: true, repo: true,
  number: true, sha: true, tag: true, label: true,
}
void _ALL_LINK_FIELDS

// ─── Round trip ─────────────────────────────────────────────────────────────────

describe('export/import round trip', () => {
  it('preserves every optional Task field', async () => {
    const blob = await exportRoadmap(phases, 'json', {
      roadmapName: 'Round Trip Fixture',
      tagRegistry,
    })
    const exportedJson = await blob.text()
    const imported = parseImportedRoadmapJson(exportedJson)
    const roundTrippedTask = imported.phases[0].tasks[1]

    expect(imported.warnings).toEqual([])
    expect(imported.repairs).toEqual([])

    expect(roundTrippedTask.id).toBe(maximalSubtask.id)
    expect(roundTrippedTask.title).toBe(maximalSubtask.title)
    expect(roundTrippedTask.done).toBe(maximalSubtask.done)
    expect(roundTrippedTask.next).toBe(maximalSubtask.next)
    expect(roundTrippedTask.est).toBe(maximalSubtask.est)
    expect(roundTrippedTask.assignees).toEqual(maximalSubtask.assignees)
    expect(roundTrippedTask.tags).toEqual(maximalSubtask.tags)
    expect(roundTrippedTask.deps).toEqual(maximalSubtask.deps)
    expect(roundTrippedTask.desc).toBe(maximalSubtask.desc)
    expect(roundTrippedTask.parentId).toBe(maximalSubtask.parentId)
    expect(roundTrippedTask.claimedBy).toBe(maximalSubtask.claimedBy)
    expect(roundTrippedTask.claimedById).toBe(maximalSubtask.claimedById)
    expect(roundTrippedTask.claimedAt).toBe(maximalSubtask.claimedAt)
    expect(roundTrippedTask.links).toEqual(maximalSubtask.links)
  })

  it('preserves the parent/subtask relationship (parentId + deps)', async () => {
    const blob = await exportRoadmap(phases, 'json', {
      roadmapName: 'Round Trip Fixture',
      tagRegistry,
    })
    const imported = parseImportedRoadmapJson(await blob.text())
    const [roundTrippedParent, roundTrippedSubtask] = imported.phases[0].tasks

    expect(roundTrippedParent.id).toBe(parentTask.id)
    expect(roundTrippedSubtask.parentId).toBe(roundTrippedParent.id)
    expect(roundTrippedSubtask.deps).toEqual([roundTrippedParent.id])
  })

  it('preserves each TaskExternalLink field across kinds', async () => {
    const blob = await exportRoadmap(phases, 'json', {
      roadmapName: 'Round Trip Fixture',
      tagRegistry,
    })
    const imported = parseImportedRoadmapJson(await blob.text())
    const links = imported.phases[0].tasks[1].links ?? []

    expect(links).toHaveLength(4)
    expect(links[0]).toEqual(issueLink)
    expect(links[1]).toEqual(commitLink)
    expect(links[2]).toEqual(releaseLink)
    expect(links[3]).toEqual(bareUrlLink)
  })

  // NOTE: this assertion currently fails. parseImportedRoadmapJson ->
  // tagRegistryFromPayload (apps/web/src/lib/roadmap-validation.ts) rebuilds
  // each TagDefinition as `{ id, label, ...(color ? { color } : {}) }`,
  // dropping `createdAt`/`updatedAt` even though exportRoadmap/
  // buildRoadmapExport writes the full TagDefinition (including
  // createdAt/updatedAt) into the exported JSON's tagRegistry. This is a
  // real round-trip gap, not a fixture mistake — see the task report for
  // details. Left as `.failing` so this test suite documents the gap
  // without blocking the rest of the suite.
  it.fails('preserves TagDefinition.createdAt and updatedAt', async () => {
    const blob = await exportRoadmap(phases, 'json', {
      roadmapName: 'Round Trip Fixture',
      tagRegistry,
    })
    const imported = parseImportedRoadmapJson(await blob.text())
    const roundTrippedFrontendTag = imported.tagRegistry?.find((t) => t.id === 'frontend')

    expect(roundTrippedFrontendTag?.color).toBe('#a78bfa')
    expect(roundTrippedFrontendTag?.createdAt).toBe('2026-01-05T08:00:00.000Z')
    expect(roundTrippedFrontendTag?.updatedAt).toBe('2026-06-01T12:30:00.000Z')
  })

  it('preserves TagDefinition.id, label, and color', async () => {
    const blob = await exportRoadmap(phases, 'json', {
      roadmapName: 'Round Trip Fixture',
      tagRegistry,
    })
    const imported = parseImportedRoadmapJson(await blob.text())
    const roundTrippedDelivery = imported.tagRegistry?.find((t) => t.id === 'delivery')

    expect(roundTrippedDelivery?.id).toBe('delivery')
    expect(roundTrippedDelivery?.label).toBe('Delivery')
    expect(roundTrippedDelivery?.color).toBe('#38bdf8')
  })
})
