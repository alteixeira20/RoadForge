import type { Roadmap, ShareLink, ExportOption } from '@/types/roadmap'

// ─── Sample roadmap data ───────────────────────────────────────────────────────
// Mirrors frontend-example/data.js.
// TODO(backend): Replace with GET /api/roadmaps/:id

export const SAMPLE_ROADMAP: Roadmap = {
  project: { id: 'rfg', name: 'Roadforge' },
  roadmap: { id: 'rm-v1', name: 'Roadforge — v1.0 Public Launch' },
  phases: [
    {
      id: 'p1',
      num: '01',
      name: 'Foundation',
      color: '#76746e',
      status: 'done',
      progress: 100,
      tasks: [
        {
          id: 'RF-01',
          title: 'Local-first storage layer',
          done: true,
          est: '3 days',
          tags: ['core', 'storage'],
          deps: [],
          desc: 'All roadmap edits land in the browser\'s local storage, keyed by roadmap id. No network round-trip on the local-only path.',
        },
        {
          id: 'RF-02',
          title: 'Roadmap schema for phases and tasks',
          done: true,
          est: '1 day',
          tags: ['schema'],
          deps: [],
          desc: 'Stable, AI-friendly schema. Version-stamped and forward-compatible so agents and humans read the same file.',
        },
        {
          id: 'RF-03',
          title: 'Display name and local identity',
          done: true,
          est: 'Half a day',
          tags: ['onboarding'],
          deps: [],
          desc: 'Per-device display name. No account, no email.',
        },
      ],
    },
    {
      id: 'p2',
      num: '02',
      name: 'Core Workspace',
      color: '#d97442',
      status: 'active',
      progress: 60,
      tasks: [
        {
          id: 'RF-04',
          title: 'Vertical phases with collapsible tasks',
          done: true,
          est: '3 days',
          tags: ['ui'],
          deps: ['RF-01', 'RF-02'],
          desc: 'The workspace you\'re looking at right now. Phases collapse to a one-line summary so you can scan the whole roadmap at a glance.',
        },
        {
          id: 'RF-05',
          title: 'Inline task detail and dependencies',
          done: false,
          next: true,
          est: '2 days',
          tags: ['ui'],
          deps: ['RF-04'],
          desc: 'Click any task to open its detail in place — description, estimate, and what it depends on. No page jumps, no side drawers.',
        },
        {
          id: 'RF-06',
          title: 'Suggested next task',
          done: false,
          est: '1 day',
          tags: ['planning'],
          deps: ['RF-05'],
          desc: 'Roadforge picks one task to focus on, based on which dependencies are clear. Shown as a single highlight, not a busy queue.',
        },
        {
          id: 'RF-07',
          title: 'Search and quick filters',
          done: false,
          est: '1 day',
          tags: ['ui'],
          deps: ['RF-04'],
          desc: 'One search box. A handful of toggles. Nothing else.',
        },
      ],
    },
    {
      id: 'p3',
      num: '03',
      name: 'Sync & Collaboration',
      color: '#c97553',
      status: 'next',
      progress: 10,
      tasks: [
        {
          id: 'RF-08',
          title: 'Self-hostable sync server',
          done: false,
          est: '5 days',
          tags: ['server'],
          deps: ['RF-02'],
          desc: 'Single binary. SQLite by default, Postgres optional. Bring your own machine.',
        },
        {
          id: 'RF-09',
          title: 'Save local roadmap to a server',
          done: false,
          est: '2 days',
          tags: ['sync'],
          deps: ['RF-08'],
          desc: 'One-way push of an existing local roadmap. After save, real-time collaboration unlocks.',
        },
        {
          id: 'RF-10',
          title: 'Activity log and presence',
          done: false,
          est: '3 days',
          tags: ['realtime'],
          deps: ['RF-09'],
          desc: 'See who\'s editing and what changed, scoped per roadmap.',
        },
        {
          id: 'RF-11',
          title: 'Signed share links',
          done: false,
          est: '2 days',
          tags: ['security'],
          deps: ['RF-09'],
          desc: 'Per-link scopes — view, comment, edit. Time-bound and revocable.',
        },
      ],
    },
    {
      id: 'p4',
      num: '04',
      name: 'AI Agent Surface',
      color: '#b85a2e',
      status: 'future',
      progress: 0,
      tasks: [
        {
          id: 'RF-12',
          title: 'Stable JSON read API for agents',
          done: false,
          est: '1 day',
          tags: ['api'],
          deps: ['RF-08'],
          desc: 'The same schema agents already see locally, served over HTTP.',
        },
        {
          id: 'RF-13',
          title: 'Agent edit proposals',
          done: false,
          est: '3 days',
          tags: ['ai'],
          deps: ['RF-12'],
          desc: 'Agents submit diffs against the roadmap. You review and accept — no silent writes.',
        },
      ],
    },
    {
      id: 'p5',
      num: '05',
      name: 'Polish & Launch',
      color: '#76746e',
      status: 'future',
      progress: 0,
      tasks: [
        {
          id: 'RF-14',
          title: 'Import from Markdown and JSON',
          done: false,
          est: '2 days',
          tags: ['import'],
          deps: ['RF-02'],
          desc: '',
        },
        {
          id: 'RF-15',
          title: 'Public docs and self-host guide',
          done: false,
          est: '2 days',
          tags: ['docs'],
          deps: ['RF-08'],
          desc: '',
        },
      ],
    },
  ],
}

// ─── Mock share links ──────────────────────────────────────────────────────────
// TODO(backend): Replace with GET /api/roadmaps/:id/share-links

export const MOCK_SHARE_LINKS: ShareLink[] = [
  {
    id: 'owner',
    role: 'owner',
    icon: 'shield',
    desc: 'Full control — manage settings, links, and members.',
    url: 'https://roadforge.local/r/v1-launch?k=ow_8hQ2…N3a',
    recommended: false,
  },
  {
    id: 'editor',
    role: 'editor',
    icon: 'users',
    desc: 'Can edit phases, tasks, and dependencies. Cannot delete the roadmap.',
    url: 'https://roadforge.local/r/v1-launch?k=ed_2bD7…XqL',
    recommended: true,
  },
  {
    id: 'viewer',
    role: 'viewer',
    icon: 'circle',
    desc: 'Can read everything but not change anything. Good for stakeholders.',
    url: 'https://roadforge.local/r/v1-launch?k=vi_91Hp…W4z',
    recommended: false,
  },
]

// ─── Export format options ─────────────────────────────────────────────────────

export const EXPORT_OPTIONS: ExportOption[] = [
  { id: 'json', icon: 'export', name: 'JSON', badge: 'Source of truth', desc: 'The portable, AI-friendly format. Re-import anywhere with no loss.' },
  { id: 'markdown', icon: 'export', name: 'Markdown', desc: 'Human-readable. Great for READMEs and pull requests.' },
  { id: 'pdf', icon: 'export', name: 'PDF', desc: 'A polished, print-ready snapshot of the current roadmap.' },
  { id: 'agent-bundle', icon: 'robot', name: 'Agent bundle', desc: 'JSON plus a short prompt preface — drop into any agent context.' },
]
