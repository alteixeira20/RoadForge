import { describe, it, expect } from 'vitest'
import { splitAndNormalizeTags } from '@/components/roadmap/TagInput'

describe('splitAndNormalizeTags', () => {
  it('lowercases and trims tags', () => {
    expect(splitAndNormalizeTags(['  Infra ', ' DESIGN '])).toEqual(['infra', 'design'])
  })

  it('splits comma-joined strings', () => {
    expect(splitAndNormalizeTags(['infra, design,backend'])).toEqual(['infra', 'design', 'backend'])
  })

  it('filters blank entries', () => {
    expect(splitAndNormalizeTags(['', '  ', 'real'])).toEqual(['real'])
  })

  it('removes assignment tags (owner:/review: prefixed)', () => {
    expect(splitAndNormalizeTags(['owner:alice', 'design', 'review:bob'])).toEqual(['design'])
  })

  it('returns empty array for empty input', () => {
    expect(splitAndNormalizeTags([])).toEqual([])
  })

  it('handles mixed input', () => {
    expect(splitAndNormalizeTags(['Infra, Design', 'owner:alice', '  backend  '])).toEqual([
      'infra',
      'design',
      'backend',
    ])
  })
})
