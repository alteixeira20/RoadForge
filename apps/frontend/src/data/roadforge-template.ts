import type { Phase, TagDefinition } from '@/types/roadmap'

export interface RoadForgeTemplate {
  roadmapName: string
  phases: Phase[]
  tagRegistry: TagDefinition[]
}

// Keep the first-run example deliberately small. It should teach the product
// in under a minute, not expose RoadForge's internal delivery process.
const STARTER_TEMPLATE: RoadForgeTemplate = {
  roadmapName: 'Product launch',
  tagRegistry: [
    { id: 'focus', label: 'Focus', color: '#f97316' },
    { id: 'research', label: 'Research', color: '#38bdf8' },
    { id: 'launch', label: 'Launch', color: '#a78bfa' },
  ],
  phases: [
    {
      id: 'starter-define',
      num: '01',
      name: 'Define the outcome',
      color: '#f97316',
      colorMode: 'auto',
      status: 'active',
      progress: 33,
      tasks: [
        {
          id: 'starter-success',
          title: 'Write one measurable success outcome',
          done: true,
          tags: ['focus'],
          desc: 'Describe what should be different when this roadmap succeeds.',
        },
        {
          id: 'starter-audience',
          title: 'Choose the first audience',
          done: false,
          next: true,
          tags: ['research'],
          desc: 'Name the smallest useful group to learn from first.',
        },
        {
          id: 'starter-constraints',
          title: 'Confirm scope, owner, and deadline',
          done: false,
          tags: ['focus'],
        },
      ],
    },
    {
      id: 'starter-build',
      num: '02',
      name: 'Build and test',
      color: '#38bdf8',
      colorMode: 'auto',
      status: 'next',
      progress: 0,
      tasks: [
        {
          id: 'starter-version',
          title: 'Create the smallest usable version',
          done: false,
          deps: ['starter-audience', 'starter-constraints'],
        },
        {
          id: 'starter-test',
          title: 'Test it with five real users',
          done: false,
          deps: ['starter-version'],
          tags: ['research'],
        },
        {
          id: 'starter-fix',
          title: 'Fix the feedback that blocks the outcome',
          done: false,
          deps: ['starter-test'],
        },
      ],
    },
    {
      id: 'starter-launch',
      num: '03',
      name: 'Release and learn',
      color: '#a78bfa',
      colorMode: 'auto',
      status: 'future',
      progress: 0,
      tasks: [
        {
          id: 'starter-checklist',
          title: 'Confirm the launch checklist',
          done: false,
          deps: ['starter-fix'],
          tags: ['launch'],
        },
        {
          id: 'starter-release',
          title: 'Release to the first audience',
          done: false,
          deps: ['starter-checklist'],
          tags: ['launch'],
        },
        {
          id: 'starter-review',
          title: 'Review the result after one week',
          done: false,
          deps: ['starter-release'],
          tags: ['research'],
        },
      ],
    },
  ],
}

// A serialized boundary guarantees every caller gets an independent snapshot,
// including nested task arrays and tag definitions.
const STARTER_TEMPLATE_JSON = JSON.stringify(STARTER_TEMPLATE)

export function createRoadForgeTemplate(): RoadForgeTemplate {
  return JSON.parse(STARTER_TEMPLATE_JSON) as RoadForgeTemplate
}
