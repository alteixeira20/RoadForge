import type { Task } from '@/types/roadmap'

const ASSIGNMENT_TAG_RE = /^(owner|review):(.+)$/i

export function cleanAssigneeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function isAssignmentTag(tag: string): boolean {
  return ASSIGNMENT_TAG_RE.test(tag.trim())
}

export function assignmentNameFromTag(tag: string): string | null {
  const match = tag.trim().match(ASSIGNMENT_TAG_RE)
  if (!match) return null
  const name = cleanAssigneeName(match[2])
  return name || null
}

export function getVisibleTaskTags(task: Task): string[] {
  return (task.tags ?? []).filter((tag) => !isAssignmentTag(tag))
}

export function getTaskAssignees(task: Task): string[] {
  const explicit = (task.assignees ?? []).map(cleanAssigneeName).filter(Boolean)
  if (explicit.length > 0) return dedupeNames(explicit)

  return dedupeNames(
    (task.tags ?? [])
      .map(assignmentNameFromTag)
      .filter((name): name is string => Boolean(name)),
  )
}

export function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  names.forEach((name) => {
    const clean = cleanAssigneeName(name)
    const key = clean.toLowerCase()
    if (!clean || seen.has(key)) return
    seen.add(key)
    result.push(clean)
  })
  return result
}

export function taskMatchesAssignee(task: Task, name: string): boolean {
  const target = cleanAssigneeName(name).toLowerCase()
  if (!target) return false
  return getTaskAssignees(task).some((assignee) => assignee.toLowerCase() === target)
}

export function removeAssignmentTags(tags: string[] | undefined): string[] {
  return (tags ?? []).filter((tag) => !isAssignmentTag(tag))
}
