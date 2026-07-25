import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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

const fixture = JSON.parse(readFileSync(
  new URL('../../../../../fixtures/roadmaps/maximal-v1.roadforge.json', import.meta.url),
  'utf8',
)) as {
  roadmap: { name: string }
  phases: Phase[]
  tagRegistry: TagDefinition[]
}
const phases = fixture.phases
const tagRegistry = fixture.tagRegistry
const parentTask = phases[1].tasks[0]
const maximalSubtask = phases[1].tasks[1] as Required<Task>
const allLinks = phases.flatMap((phase) => phase.tasks.flatMap((task) => task.links ?? []))
const issueLink = allLinks.find((link) => link.id === 'link-issue')!
const commitLink = allLinks.find((link) => link.id === 'link-commit')!
const releaseLink = allLinks.find((link) => link.id === 'link-release')!
const bareUrlLink = allLinks.find((link) => link.id === 'link-spec')!

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
    const roundTrippedTask = imported.phases[1].tasks[1]

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
    const [roundTrippedParent, roundTrippedSubtask] = imported.phases[1].tasks

    expect(roundTrippedParent.id).toBe(parentTask.id)
    expect(roundTrippedSubtask.parentId).toBe(roundTrippedParent.id)
    expect(roundTrippedSubtask.deps).toContain(roundTrippedParent.id)
  })

  it('preserves each TaskExternalLink field across kinds', async () => {
    const blob = await exportRoadmap(phases, 'json', {
      roadmapName: 'Round Trip Fixture',
      tagRegistry,
    })
    const imported = parseImportedRoadmapJson(await blob.text())
    const links = imported.phases.flatMap(
      (phase) => phase.tasks.flatMap((task) => task.links ?? []),
    )

    expect(links).toHaveLength(6)
    expect(links).toContainEqual(issueLink)
    expect(links).toContainEqual(commitLink)
    expect(links).toContainEqual(releaseLink)
    expect(links).toContainEqual(bareUrlLink)
  })

  it('preserves TagDefinition.createdAt and updatedAt', async () => {
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

  it('excludes credential, lock, session, and other volatile state', async () => {
    const poisonedPhases = structuredClone(phases) as unknown as Array<
      Phase & Record<string, unknown>
    >
    poisonedPhases[0].sessionToken = 'session-secret'
    poisonedPhases[0].tasks[0] = {
      ...poisonedPhases[0].tasks[0],
      password: 'password-secret',
      inviteToken: 'invite-secret',
      lock: { participantId: 'pt_secret' },
    } as Task

    const blob = await exportRoadmap(poisonedPhases, 'json', {
      roadmapName: fixture.roadmap.name,
      tagRegistry,
    })
    const exported = await blob.text()

    expect(exported).not.toContain('session-secret')
    expect(exported).not.toContain('password-secret')
    expect(exported).not.toContain('invite-secret')
    expect(exported).not.toContain('pt_secret')
    expect(exported).not.toContain('sessionToken')
    expect(exported).not.toContain('"lock"')
  })
})
