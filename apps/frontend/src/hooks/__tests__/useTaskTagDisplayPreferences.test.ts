import { describe, expect, it } from 'vitest'
import {
  getUserDisplayTags,
  isAutomaticTaskTag,
} from '../useTaskTagDisplayPreferences'

describe('task tag display preferences', () => {
  it('recognizes status namespace tags as automatic', () => {
    expect(isAutomaticTaskTag('status:done')).toBe(true)
    expect(isAutomaticTaskTag(' STATUS:in-progress ')).toBe(true)
    expect(isAutomaticTaskTag('priority:P0')).toBe(false)
  })

  it('keeps custom tags in their authored order', () => {
    expect(getUserDisplayTags([
      'status:done',
      'priority:P0',
      'area:coordination',
      'status:planned',
    ])).toEqual([
      'priority:P0',
      'area:coordination',
    ])
  })
})
