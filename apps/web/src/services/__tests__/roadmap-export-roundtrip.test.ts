import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { exportRoadmap } from '@/services/roadmap-crud.service'
import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'
import { computeTaskDisplayNumbers } from '@/lib/task-display'
import type { Phase, Task, TagDefinition, TaskExternalLink } from '@/types/roadmap'

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
const displayNumbers = computeTaskDisplayNumbers(phases)
const parentDisplayNumber = displayNumbers.get(parentTask.id)!
const allLinks = phases.flatMap((phase) => phase.tasks.flatMap((task) => task.links ?? []))
const issueLink = allLinks.find((link) => link.id === 'link-issue')!
const commitLink = allLinks.find((link) => link.id === 'link-commit')!
const releaseLink = allLinks.find((link) => link.id === 'link-release')!
const bareUrlLink = allLinks.find((link) => link.id === 'link-spec')!

// Compile-time canaries ensure changes to internal domain shapes force this
// portable-format test to be revisited deliberately.
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

describe('portable v2 export/import round trip', () => {
  it('exports order-based task references without editable task IDs', async () => {
    const blob = await exportRoadmap(phases, 'json', {
      roadmapName: 'Round Trip Fixture',
      tagRegistry,
    })
    const exported = JSON.parse(await blob.text()) as {
      schema: string
      version: number
      phases: Array<{ tasks: Array<Record<string, unknown>> }>
    }

    expect(exported.schema).toBe('roadforge.roadmap.export')
    expect(exported.version).toBe(2)

    const exportedTasks = exported.phases.flatMap((phase) => phase.tasks)
    for (const task of exportedTasks) {
      expect(task).not.toHaveProperty('id')
      expect(task).not.toHaveProperty('next')
      expect(task).not.toHaveProperty('parentId')
      expect(task).not.toHaveProperty('claimedBy')
      expect(task).not.toHaveProperty('claimedById')
      expect(task).not.toHaveProperty('claimedAt')
    }

    const exportedSubtask = exported.phases[1].tasks[1]
    expect(exportedSubtask.recommended).toBe(maximalSubtask.next)
    expect(exportedSubtask.parent).toBe(parentDisplayNumber)
    expect(exportedSubtask.deps).toContain(parentDisplayNumber)
  })

  it('reconstructs opaque internal IDs while preserving task content and relationships', async () => {
    const blob = await exportRoadmap(phases, 'json', {
      roadmapName: 'Round Trip Fixture',
      tagRegistry,
    })
    const imported = parseImportedRoadmapJson(await blob.text())
    const [roundTrippedParent, roundTrippedSubtask] = imported.phases[1].tasks

    expect(imported.warnings).toEqual([])
    expect(imported.repairs).toEqual([])
    expect(roundTrippedParent.id).not.toBe(parentTask.id)
    expect(roundTrippedSubtask.id).not.toBe(maximalSubtask.id)
    expect(roundTrippedSubtask.parentId).toBe(roundTrippedParent.id)
    expect(roundTrippedSubtask.deps).toContain(roundTrippedParent.id)

    expect(roundTrippedSubtask.title).toBe(maximalSubtask.title)
    expect(roundTrippedSubtask.done).toBe(maximalSubtask.done)
    expect(roundTrippedSubtask.next).toBe(maximalSubtask.next)
    expect(roundTrippedSubtask.est).toBe(maximalSubtask.est)
    expect(roundTrippedSubtask.assignees).toEqual(maximalSubtask.assignees)
    expect(roundTrippedSubtask.tags).toEqual(maximalSubtask.tags)
    expect(roundTrippedSubtask.desc).toBe(maximalSubtask.desc)
    expect(roundTrippedSubtask.links).toEqual(maximalSubtask.links)

    // Claims are collaboration/session state, not portable roadmap content.
    expect(roundTrippedSubtask.claimedBy).toBeUndefined()
    expect(roundTrippedSubtask.claimedById).toBeUndefined()
    expect(roundTrippedSubtask.claimedAt).toBeUndefined()
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

  it('preserves the tag registry', async () => {
    const blob = await exportRoadmap(phases, 'json', {
      roadmapName: 'Round Trip Fixture',
      tagRegistry,
    })
    const imported = parseImportedRoadmapJson(await blob.text())
    const frontend = imported.tagRegistry?.find((tag) => tag.id === 'frontend')
    const delivery = imported.tagRegistry?.find((tag) => tag.id === 'delivery')

    expect(frontend?.color).toBe('#a78bfa')
    expect(frontend?.createdAt).toBe('2026-01-05T08:00:00.000Z')
    expect(frontend?.updatedAt).toBe('2026-06-01T12:30:00.000Z')
    expect(delivery).toMatchObject({ id: 'delivery', label: 'Delivery', color: '#38bdf8' })
  })

  it('excludes credentials, locks, sessions, claims, and other volatile state', async () => {
    const poisonedPhases = structuredClone(phases) as unknown as Array<
      Phase & Record<string, unknown>
    >
    poisonedPhases[0].sessionToken = 'session-secret'
    poisonedPhases[0].tasks[0] = {
      ...poisonedPhases[0].tasks[0],
      password: 'password-secret',
      inviteToken: 'invite-secret',
      lock: { participantId: 'pt_secret' },
      claimedBy: 'Transient collaborator',
      claimedById: 'pt_claim',
      claimedAt: '2026-08-12T12:00:00.000Z',
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
    expect(exported).not.toContain('pt_claim')
    expect(exported).not.toContain('sessionToken')
    expect(exported).not.toContain('"lock"')
    expect(exported).not.toContain('claimedBy')
  })
})
