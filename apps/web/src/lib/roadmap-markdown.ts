import type {
  Phase,
  TagDefinition,
  Task,
  TaskExternalLink,
} from '@/types/roadmap'

interface RoadmapMarkdownInput {
  roadmapName?: string
  phases: Phase[]
  tagRegistry?: TagDefinition[]
}

const MAX_FILENAME_STEM_LENGTH = 80
const WINDOWS_RESERVED_STEMS = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
])

const INLINE_MARKDOWN_CHARACTERS = new Set([
  '\\',
  '`',
  '*',
  '_',
  '[',
  ']',
  '<',
  '>',
  '#',
  '!',
  '|',
])

const PHASE_STATUS_LABELS: Record<Phase['status'], string> = {
  done: 'Done',
  active: 'Active',
  next: 'Next',
  future: 'Future',
}

function toSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeInlineMarkdown(value: string): string {
  return Array.from(toSingleLine(value), (character) => (
    INLINE_MARKDOWN_CHARACTERS.has(character) ? `\\${character}` : character
  )).join('')
}

function formatInlineCode(value: string): string {
  const content = toSingleLine(value)
  const backtickRuns = content.match(/`+/g) ?? []
  const longestRun = backtickRuns.reduce(
    (longest, run) => Math.max(longest, run.length),
    0,
  )
  const fence = '`'.repeat(longestRun + 1)
  const needsPadding = content.startsWith('`') || content.endsWith('`')
  const padding = needsPadding ? ' ' : ''

  return `${fence}${padding}${content}${padding}${fence}`
}

function linkLabel(link: TaskExternalLink): string {
  if (link.label?.trim()) return escapeInlineMarkdown(link.label)
  if (link.provider === 'url') return 'External link'

  const labels: Record<TaskExternalLink['kind'], string> = {
    issue: 'GitHub issue',
    pull: 'GitHub pull request',
    discussion: 'GitHub discussion',
    commit: 'GitHub commit',
    release: 'GitHub release',
    url: 'External link',
  }
  return labels[link.kind]
}

function formatTask(
  task: Task,
  tagLabels: ReadonlyMap<string, string>,
): string[] {
  const heading = task.parentId ? '####' : '###'
  const checkbox = task.done ? '[x]' : '[ ]'
  const lines = [
    `${heading} ${checkbox} ${formatInlineCode(task.id)} - ${escapeInlineMarkdown(task.title)}`,
  ]
  const metadata: string[] = []

  if (task.parentId) {
    metadata.push(`- **Parent:** ${formatInlineCode(task.parentId)}`)
  }
  if (task.next === true) metadata.push('- **Next:** Yes')
  if (task.est) metadata.push(`- **Estimate:** ${escapeInlineMarkdown(task.est)}`)
  if (task.assignees?.length) {
    metadata.push(`- **Assignees:** ${task.assignees.map(escapeInlineMarkdown).join(', ')}`)
  }
  if (task.tags?.length) {
    const tags = task.tags.map((tagId) => tagLabels.get(tagId) ?? tagId)
    metadata.push(`- **Tags:** ${tags.map(escapeInlineMarkdown).join(', ')}`)
  }
  if (task.deps?.length) {
    metadata.push(`- **Dependencies:** ${task.deps.map(formatInlineCode).join(', ')}`)
  }

  if (metadata.length) lines.push('', ...metadata)
  if (task.desc) lines.push('', task.desc)
  if (task.links?.length) {
    lines.push(
      '',
      '**Links**',
      ...task.links.map((link) => `- ${linkLabel(link)}: <${link.url}>`),
    )
  }

  return lines
}

function formatPhase(
  phase: Phase,
  tagLabels: ReadonlyMap<string, string>,
): string[] {
  const lines = [
    `## Phase ${escapeInlineMarkdown(phase.num)} - ${escapeInlineMarkdown(phase.name)}`,
    '',
    `- **Status:** ${PHASE_STATUS_LABELS[phase.status]}`,
    `- **Progress:** ${phase.progress}%`,
  ]

  if (phase.tasks.length === 0) {
    lines.push('', '_No tasks._')
    return lines
  }

  for (const task of phase.tasks) {
    lines.push('', ...formatTask(task, tagLabels))
  }
  return lines
}

export function formatRoadmapMarkdown({
  roadmapName,
  phases,
  tagRegistry = [],
}: RoadmapMarkdownInput): string {
  const title = roadmapName?.trim() || 'Untitled Roadmap'
  const tagLabels = new Map(tagRegistry.map((tag) => [tag.id, tag.label]))
  const lines = [`# ${escapeInlineMarkdown(title)}`]

  if (phases.length === 0) {
    lines.push('', '_No phases._')
  } else {
    for (const phase of phases) {
      lines.push('', ...formatPhase(phase, tagLabels))
    }
  }

  return `${lines.join('\n')}\n`
}

export function createMarkdownExportFilename(roadmapName: string): string {
  let stem = roadmapName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_FILENAME_STEM_LENGTH)
    .replace(/-+$/g, '')

  if (!stem) stem = 'roadmap'
  if (WINDOWS_RESERVED_STEMS.has(stem)) stem = `roadmap-${stem}`

  return `${stem}.roadforge.md`
}
