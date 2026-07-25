import type { ExportOption, ShareLink } from '@/types/roadmap'

// Fallback displayed in ShareModal before a roadmap is saved to the server.
export const MOCK_SHARE_LINKS: ShareLink[] = [
  {
    id: 'owner',
    role: 'owner',
    icon: 'shield',
    desc: 'Full control — manage settings, links, and members.',
    url: 'https://roadforge.anvilary.tools/r/v1-launch?k=ow_8hQ2…N3a',
    isActive: true,
    recommended: false,
  },
  {
    id: 'editor',
    role: 'editor',
    icon: 'users',
    desc: 'Can edit phases, tasks, and dependencies. Cannot delete the roadmap.',
    url: 'https://roadforge.anvilary.tools/r/v1-launch?k=ed_2bD7…XqL',
    isActive: true,
    recommended: true,
  },
  {
    id: 'viewer',
    role: 'viewer',
    icon: 'circle',
    desc: 'Can read everything but not change anything. Good for stakeholders.',
    url: 'https://roadforge.anvilary.tools/r/v1-launch?k=vi_91Hp…W4z',
    isActive: true,
    recommended: false,
  },
]

export const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: 'json',
    icon: 'export',
    name: 'Export JSON',
    badge: 'Source of truth',
    desc: 'The portable RoadForge format. Re-import anywhere with no loss.',
  },
]
