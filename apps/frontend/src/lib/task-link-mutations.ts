import type { TaskExternalLink } from '@/types/roadmap'

interface RemoveTaskLinkWithLockParams {
  links: TaskExternalLink[]
  linkId: string
  acquireLock: () => Promise<boolean>
  releaseLock: () => Promise<void>
  onUpdateLinks: (links: TaskExternalLink[]) => Promise<boolean>
}

export async function removeTaskLinkWithLock({
  links,
  linkId,
  acquireLock,
  releaseLock,
  onUpdateLinks,
}: RemoveTaskLinkWithLockParams): Promise<boolean> {
  if (!await acquireLock()) return false

  try {
    return await onUpdateLinks(links.filter((link) => link.id !== linkId))
  } finally {
    await releaseLock()
  }
}
