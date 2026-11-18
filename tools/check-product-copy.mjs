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
  'apps/frontend/src/app/help/page.tsx',
  'apps/frontend/src/app/layout.tsx',
  'apps/frontend/src/features/marketing/components/HeroSection.tsx',
  'apps/frontend/src/features/marketing/components/FeaturesSection.tsx',
  'apps/frontend/src/features/marketing/components/HowItWorksSection.tsx',
  'apps/frontend/src/shared/ui/SiteFooter.tsx',
  'apps/frontend/src/features/workspace/components/Workspace.tsx',
  'apps/frontend/src/features/sharing/components/ShareModal.tsx',
  'apps/frontend/src/features/sharing/components/ShareRoleSection.tsx',
  'apps/frontend/src/features/sharing/services/sharing.service.ts',
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
    'official demo/reference',
    'Export important roadmaps as JSON',
    'especially for a larger team',
    'controlled clone and self-host it',
    'Owner/editor/viewer invite links and participant sessions are bearer credentials',
    'Release readiness',
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
  ['docs/access-model.md', [
    'A viewer invite grants read-only collaboration access',
    'not a public publishing URL',
    'cannot be recovered from ordinary share-link listing',
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
  ['apps/frontend/src/app/help/page.tsx', [
    'hosted demo',
    'larger team',
    'fork the repository',
    'no hosted',
    'Owner, editor, and viewer links are access credentials',
    'not public publishing links',
  ]],
  ['apps/frontend/src/features/marketing/components/HeroSection.tsx', [
    'Export JSON backups',
    'Hosted demo',
    'larger-team use',
    'fork and self-host',
  ]],
  ['apps/frontend/src/features/marketing/components/FeaturesSection.tsx', [
    'Fork and self-host',
    'larger-team',
  ]],
  ['apps/frontend/src/features/marketing/components/HowItWorksSection.tsx', [
    'without choosing your next action',
    'fork and self-host RoadForge',
  ]],
  ['apps/frontend/src/shared/ui/SiteFooter.tsx', [
    'Hosted demo',
    'Non-commercial source available',
    'Fork/self-host for team use',
  ]],
  ['apps/frontend/src/features/sharing/components/ShareModal.tsx', [
    'Read-only viewer invite',
    'not public publishing links',
  ]],
  ['apps/frontend/src/features/sharing/components/ShareRoleSection.tsx', [
    'not a public publishing URL',
  ]],
  ['apps/frontend/src/features/sharing/services/sharing.service.ts', [
    'Treat this invite as a private credential',
  ]],
])

const forbiddenStatements = new Map([
  ['apps/frontend/src/features/sharing/components/ShareModal.tsx', [
    'Public viewer link',
    'public read-only link',
    'Generate public link',
    'public viewer URL',
  ]],
  ['apps/frontend/src/features/sharing/components/ShareRoleSection.tsx', [
    'README, portfolio, or live demo',
  ]],
  ['apps/frontend/src/features/sharing/services/sharing.service.ts', [
    'Good for public demos',
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

  for (const statement of forbiddenStatements.get(relativePath) ?? []) {
    if (normalizedContent.includes(statement)) {
      failures.push(`${relativePath}: forbidden current copy: ${JSON.stringify(statement)}`)
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
