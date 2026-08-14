import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInteractiveTaskId } from '@/lib/task-id'

const UUID_A = '11111111-1111-4111-8111-111111111111'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('interactive task IDs', () => {
  it('uses a Web Crypto UUID under the RoadForge task prefix', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID_A)

    expect(createInteractiveTaskId()).toBe(`rf-t-${UUID_A}`)
  })
})
