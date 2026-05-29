import { describe, it, expect } from 'vitest'
import { generateSubtaskId } from '../task-graph'
import type { Task } from '@/types/roadmap'

const t = (id: string, parentId?: string): Task => ({
  id, title: 'task', done: false, parentId,
})

describe('generateSubtaskId', () => {
  it('returns parent-01 when no existing subtasks', () => {
    expect(generateSubtaskId('RF-01', [t('RF-01')])).toBe('RF-01-01')
  })

  it('increments past one existing sibling', () => {
    const tasks = [t('RF-01'), t('RF-01-01', 'RF-01')]
    expect(generateSubtaskId('RF-01', tasks)).toBe('RF-01-02')
  })

  it('fills first gap in sibling IDs', () => {
    const tasks = [t('RF-01'), t('RF-01-01', 'RF-01'), t('RF-01-03', 'RF-01')]
    expect(generateSubtaskId('RF-01', tasks)).toBe('RF-01-02')
  })

  it('works with non-RF parent IDs', () => {
    const tasks = [t('WR-2501')]
    expect(generateSubtaskId('WR-2501', tasks)).toBe('WR-2501-01')
  })

  it('does not collide with an existing unrelated ID matching the pattern', () => {
    const tasks = [t('RF-01'), t('RF-01-01')]
    expect(generateSubtaskId('RF-01', tasks)).toBe('RF-01-02')
  })
})
