import { describe, expect, it, vi } from 'vitest'
import { removeTaskLinkWithLock } from '@/lib/task-link-mutations'
import type { TaskExternalLink } from '@/types/roadmap'

const links: TaskExternalLink[] = [
  {
    id: 'remove-me',
    provider: 'github',
    kind: 'issue',
    url: 'https://github.com/anvilary/roadforge/issues/605',
    owner: 'anvilary',
    repo: 'roadforge',
    number: 605,
  },
  {
    id: 'keep-generic',
    provider: 'url',
    kind: 'url',
    url: 'https://example.com/spec',
  },
  {
    id: 'keep-pr',
    provider: 'github',
    kind: 'pull',
    url: 'https://github.com/anvilary/roadforge/pull/606',
    owner: 'anvilary',
    repo: 'roadforge',
    number: 606,
  },
]

describe('removeTaskLinkWithLock', () => {
  it('updates with only the selected link removed and releases the lock', async () => {
    const acquireLock = vi.fn(async () => true)
    const releaseLock = vi.fn(async () => {})
    const onUpdateLinks = vi.fn(async () => true)

    await expect(removeTaskLinkWithLock({
      links,
      linkId: 'remove-me',
      acquireLock,
      releaseLock,
      onUpdateLinks,
    })).resolves.toBe(true)

    expect(onUpdateLinks).toHaveBeenCalledWith([links[1], links[2]])
    expect(releaseLock).toHaveBeenCalledOnce()
  })

  it('does not update when the task lock cannot be acquired', async () => {
    const releaseLock = vi.fn(async () => {})
    const onUpdateLinks = vi.fn(async () => true)

    await expect(removeTaskLinkWithLock({
      links,
      linkId: 'remove-me',
      acquireLock: vi.fn(async () => false),
      releaseLock,
      onUpdateLinks,
    })).resolves.toBe(false)

    expect(onUpdateLinks).not.toHaveBeenCalled()
    expect(releaseLock).not.toHaveBeenCalled()
  })

  it('releases the task lock when the update is rejected', async () => {
    const releaseLock = vi.fn(async () => {})

    await expect(removeTaskLinkWithLock({
      links,
      linkId: 'remove-me',
      acquireLock: vi.fn(async () => true),
      releaseLock,
      onUpdateLinks: vi.fn(async () => false),
    })).resolves.toBe(false)

    expect(releaseLock).toHaveBeenCalledOnce()
  })
})
