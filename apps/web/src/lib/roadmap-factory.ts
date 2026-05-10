import type { Phase } from '@/types/roadmap'

/**
 * Creates the initial state for a blank roadmap.
 * Contains one empty starter phase.
 */
export function createBlankPhases(): Phase[] {
  return [
    {
      id: 'p-starter',
      num: '01',
      name: 'Planning',
      color: '#76746e',
      status: 'active',
      progress: 0,
      tasks: [],
    },
  ]
}
