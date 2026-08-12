import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')

// These are current product/release surfaces. Historical design records are
// deliberately excluded: the copy gate protects what users and contributors
// are told today, not immutable history.
const currentSurfaces = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
  'CHANGELOG.md',
  '.github/RELEASE_CHECKLIST.md',
  'docs/README.md',
  'docs/hosted-demo-and-self-hosting.md',
  'docs/access-model.md',
  'docs/frontend-foundation.md',
  'docs/self-hosting.md',
  'docs/public-deployment-security.md',
  'docs/server-data-retention.md',
  'docs/architecture/overview.md',
  'docs/architecture/source-of-truth-rules.md',
  'deploy/self-hosted/README.md',
  'apps/web/src/app/help/page.tsx',
  'apps/web/src/app/layout.tsx',
  'apps/web/src/components/home/HeroSection.tsx',
  'apps/web/src/components/home/FeaturesSection.tsx',
  'apps/web/src/components/home/HowItWorksSection.tsx',
  'apps/web/src/components/layout/SiteFooter.tsx',
  'apps/web/src/components/roadmap/Workspace.tsx',
]

const stalePatterns = [
  { label: 'Alpha lifecycle terminology', pattern: /\balpha\b/i },
  { label: 'Clean Beta lifecycle terminology', pattern: /\bclean beta\b/i },
  { label: 'MVP lifecycle terminology', pattern: /\bMVP\b/ },
  { label: 'Work in Progress terminology', pattern: /\bwork in progress\b/i },
  { label: 'WIP terminology', pattern: /\bWIP\b/ },
  {
    label: 'unqualified open-source positioning',
    pattern: /\b(?:is|as|an)\s+(?:an?\s+)?open[- ]source\b/i,
  },
]

const requiredStatements = new Map([
  ['README.md', [
    '0.1.0',
    'source-available',
    'PolyForm Noncommercial License 1.0.0',
    'official demo/reference deployment',
    'Export important roadmaps as JSON',
    'especially for a larger team',
    'fork the repository',
  ]],
  ['CONTRIBUTING.md', [
    'source-available',
    'PolyForm Noncommercial License 1.0.0',
    'not OSI-approved open',
    'commercial use is not granted',
  ]],
  ['SUPPORT.md', [
    'hosted demo/reference deployment',
    'larger team',
    'self-host',
  ]],
  ['.github/RELEASE_CHECKLIST.md', [
    'hosted demo/reference deployment',
    'larger-team use',
    'capacity/load testing',
  ]],
  ['docs/README.md', [
    'hosted demo/reference deployment',
    'larger teams',
    'Hosted demo and self-hosting',
  ]],
  ['docs/hosted-demo-and-self-hosting.md', [
    'official hosted demo/reference deployment',
    'larger teams',
    'fork the repository',
    'no SLA',
    'load-test',
  ]],
  ['docs/self-hosting.md', [
    'demo/convenience deployment',
    'portable JSON exports',
    'especially for a larger team',
    'load-testing',
  ]],
  ['docs/public-deployment-security.md', [
    '5 MiB',
    '/api/health/live',
    '/api/health/ready',
    'backward-compatible alias for readiness',
    'demo/reference deployment',
    'especially larger teams',
  ]],
  ['docs/server-data-retention.md', [
    'demo/reference deployment',
    'larger or operationally important teams',
    'not an SLA',
  ]],
  ['deploy/self-hosted/README.md', [
    'reference self-hosted topology',
    'hosted demo/reference deployment',
    'especially larger teams',
    'load-testing',
  ]],
  ['apps/web/src/app/help/page.tsx', [
    'hosted demo',
    'larger team',
    'fork the repository',
    'no hosted',
  ]],
  ['apps/web/src/components/home/HeroSection.tsx', [
    'Export JSON backups',
    'Hosted demo',
    'larger-team use',
    'fork and self-host',
  ]],
  ['apps/web/src/components/home/FeaturesSection.tsx', [
    'Fork and self-host',
    'larger-team',
  ]],
  ['apps/web/src/components/home/HowItWorksSection.tsx', [
    'without choosing your next action',
    'fork and self-host RoadForge',
  ]],
  ['apps/web/src/components/layout/SiteFooter.tsx', [
    'Hosted demo',
    'Non-commercial source available',
    'Fork/self-host for team use',
  ]],
])

const failures = []

for (const relativePath of currentSurfaces) {
  const absolutePath = resolve(repositoryRoot, relativePath)
  const content = readFileSync(absolutePath, 'utf8')
  const normalizedContent = content.replace(/\s+/g, ' ')

  for (const { label, pattern } of stalePatterns) {
    const match = content.match(pattern)
    if (match) {
      const line = content.slice(0, match.index).split('\n').length
      failures.push(`${relativePath}:${line}: ${label}: ${JSON.stringify(match[0])}`)
    }
  }

  for (const statement of requiredStatements.get(relativePath) ?? []) {
    if (!normalizedContent.includes(statement)) {
      failures.push(`${relativePath}: missing required copy: ${JSON.stringify(statement)}`)
    }
  }
}

if (failures.length > 0) {
  console.error('Product copy validation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Product copy validation passed for ${currentSurfaces.length} current surfaces.`)
}
