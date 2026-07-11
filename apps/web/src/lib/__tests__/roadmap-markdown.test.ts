import { describe, expect, it } from 'vitest'
import {
  createMarkdownExportFilename,
  formatRoadmapMarkdown,
} from '@/lib/roadmap-markdown'
import type { Phase, TagDefinition } from '@/types/roadmap'

const description = [
  'Opening paragraph with **bold**, *italic*, and `inline code`.',
  '',
  '- [ ] Preserve this checklist',
  '- [x] Preserve this completed item',
  '',
  '> Preserve this quote exactly.',
].join('\n')

const tagRegistry: TagDefinition[] = [
  { id: 'planning', label: 'Planning' },
  { id: 'frontend', label: 'Frontend' },
]

const phases: Phase[] = [
  {
    id: 'phase-1',
    num: '01',
    name: 'Discovery',
    color: '#f97316',
    status: 'done',
    progress: 100,
    tasks: [
      {
        id: 'RF-1',
        title: 'Completed dependency',
        done: true,
        tags: ['planning'],
      },
    ],
  },
  {
    id: 'phase-2',
    num: '02',
    name: 'Implementation',
    color: '#38bdf8',
    status: 'active',
    progress: 0,
    tasks: [
      {
        id: 'RF-2',
        title: 'Parent task',
        done: false,
        est: '5d',
      },
      {
        id: 'RF-3',
        title: 'Markdown export',
        done: false,
        next: true,
        parentId: 'RF-2',
        est: '2d',
        assignees: ['Alex', 'Sam'],
        tags: ['frontend', 'unknown-tag'],
        deps: ['RF-1'],
        desc: description,
        claimedBy: 'Operational participant state',
        claimedById: 'sess_secret_claimant',
        claimedAt: 'invite_secret_timestamp',
        links: [
          {
            id: 'link-issue',
            provider: 'github',
            kind: 'issue',
            url: 'https://github.com/anvilary/roadforge/issues/1005',
            owner: 'anvilary',
            repo: 'roadforge',
            number: 1005,
            label: 'Implementation issue',
          },
          {
            id: 'link-spec',
            provider: 'url',
            kind: 'url',
            url: 'https://example.com/spec',
          },
        ],
      },
    ],
  },
]

describe('formatRoadmapMarkdown', () => {
  it('is deterministic for identical input', () => {
    const input = { roadmapName: 'Public Alpha', phases, tagRegistry }

    expect(formatRoadmapMarkdown(input)).toBe(formatRoadmapMarkdown(input))
  })

  it('preserves phase, task, and subtask order', () => {
    const output = formatRoadmapMarkdown({ roadmapName: 'Public Alpha', phases, tagRegistry })

    expect(output.indexOf('Phase 01 - Discovery')).toBeLessThan(output.indexOf('Phase 02 - Implementation'))
    expect(output.indexOf('`RF-2` - Parent task')).toBeLessThan(output.indexOf('`RF-3` - Markdown export'))
    expect(output).toContain('#### [ ] `RF-3` - Markdown export')
    expect(output).toContain('- **Parent:** `RF-2`')
  })

  it('renders phase status, progress, completion, and next indicators', () => {
    const output = formatRoadmapMarkdown({ roadmapName: 'Public Alpha', phases, tagRegistry })

    expect(output).toContain('## Phase 01 - Discovery\n\n- **Status:** Done\n- **Progress:** 100%')
    expect(output).toContain('## Phase 02 - Implementation\n\n- **Status:** Active\n- **Progress:** 0%')
    expect(output).toContain('### [x] `RF-1` - Completed dependency')
    expect(output).toContain('#### [ ] `RF-3` - Markdown export')
    expect(output).toContain('- **Next:** Yes')
  })

  it('preserves complex user-authored Markdown descriptions', () => {
    const output = formatRoadmapMarkdown({ roadmapName: 'Public Alpha', phases, tagRegistry })

    expect(output).toContain(`\n${description}\n`)
  })

  it('renders estimates, assignees, tags, dependencies, and links', () => {
    const output = formatRoadmapMarkdown({ roadmapName: 'Public Alpha', phases, tagRegistry })

    expect(output).toContain('- **Estimate:** 2d')
    expect(output).toContain('- **Assignees:** Alex, Sam')
    expect(output).toContain('- **Tags:** Frontend, unknown-tag')
    expect(output).toContain('- **Dependencies:** `RF-1`')
    expect(output).toContain('- Implementation issue: <https://github.com/anvilary/roadforge/issues/1005>')
    expect(output).toContain('- External link: <https://example.com/spec>')
  })

  it('uses valid code spans for identifiers containing backticks', () => {
    const specialPhase: Phase = {
      id: 'phase-special',
      num: '03',
      name: 'Special identifiers',
      color: '#000000',
      status: 'future',
      progress: 0,
      tasks: [
        {
          id: 'RF-`1`',
          title: 'Escaped identifiers',
          done: false,
          parentId: 'PARENT-`0`',
          deps: ['DEP-``-2'],
        },
      ],
    }

    const output = formatRoadmapMarkdown({
      roadmapName: 'Special',
      phases: [specialPhase],
    })

    expect(output).toContain('#### [ ] `` RF-`1` `` - Escaped identifiers')
    expect(output).toContain('- **Parent:** `` PARENT-`0` ``')
    expect(output).toContain('- **Dependencies:** ```DEP-``-2```')
    expect(output).not.toContain('\\`')
  })

  it('handles empty roadmaps and empty phases', () => {
    expect(formatRoadmapMarkdown({ roadmapName: '', phases: [] }))
      .toBe('# Untitled Roadmap\n\n_No phases._\n')

    const emptyPhase: Phase = {
      id: 'phase-empty',
      num: '01',
      name: 'Empty phase',
      color: '#000000',
      status: 'future',
      progress: 0,
      tasks: [],
    }
    expect(formatRoadmapMarkdown({ roadmapName: 'Empty', phases: [emptyPhase] }))
      .toContain(
        '## Phase 01 - Empty phase\n\n- **Status:** Future\n- **Progress:** 0%\n\n_No tasks._',
      )
  })

  it('does not serialize credential, session, or volatile claim fields', () => {
    const input = {
      roadmapName: 'Secrets',
      phases,
      tagRegistry,
      sessionToken: 'sess_top_level_secret',
      inviteToken: 'ow_invite_secret',
      password: 'password_secret',
    } as Parameters<typeof formatRoadmapMarkdown>[0]
    const output = formatRoadmapMarkdown(input)

    expect(output).not.toContain('sess_top_level_secret')
    expect(output).not.toContain('ow_invite_secret')
    expect(output).not.toContain('password_secret')
    expect(output).not.toContain('sess_secret_claimant')
    expect(output).not.toContain('invite_secret_timestamp')
    expect(output).not.toContain('Operational participant state')
  })
})

describe('createMarkdownExportFilename', () => {
  it.each([
    ['  Public Alpha  ', 'public-alpha.roadforge.md'],
    ['Árvore / Q3', 'arvore-q3.roadforge.md'],
    ['../../', 'roadmap.roadforge.md'],
    ['CON', 'roadmap-con.roadforge.md'],
  ])('normalizes %s safely', (name, expected) => {
    expect(createMarkdownExportFilename(name)).toBe(expected)
  })

  it('caps the filename stem deterministically', () => {
    expect(createMarkdownExportFilename('A'.repeat(120)))
      .toBe(`${'a'.repeat(80)}.roadforge.md`)
  })
})
