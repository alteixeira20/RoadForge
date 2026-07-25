import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const currentSurfaces = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
  'CHANGELOG.md',
  '.github/RELEASE_CHECKLIST.md',
  'docs/access-model.md',
  'docs/frontend-foundation.md',
  'docs/self-hosting.md',
  'docs/public-deployment-security.md',
  'docs/architecture/overview.md',
  'docs/architecture/realtime-feedback-contract.md',
  'docs/architecture/source-of-truth-rules.md',
  'docs/security/security-headers-policy.md',
  'apps/web/src/app/help/page.tsx',
  'apps/web/src/app/layout.tsx',
  'apps/web/src/components/layout/SiteFooter.tsx',
  'apps/web/src/components/roadmap/Workspace.tsx',
]

const stalePatterns = [
  { label: 'Alpha release terminology', pattern: /\balpha\b/i },
  { label: 'Work in Progress terminology', pattern: /\bwork in progress\b/i },
  { label: 'WIP terminology', pattern: /\bWIP\b/ },
  {
    label: 'unqualified open-source positioning',
    pattern: /\b(?:is|as|an)\s+(?:an?\s+)?open[- ]source\b/i,
  },
]

const requiredStatements = new Map([
  ['README.md', [
    'source-available',
    'PolyForm Noncommercial License 1.0.0',
    'not open source under the Open Source Definition',
    'commercial use remains restricted',
  ]],
  ['CONTRIBUTING.md', [
    'source-available',
    'PolyForm Noncommercial License 1.0.0',
    'not OSI-approved open',
    'commercial use is not granted',
  ]],
  ['docs/self-hosting.md', [
    'source-available',
    'PolyForm Noncommercial License 1.0.0',
    'not open source under the Open Source Definition',
    'commercial hosting or monetized use is not permitted',
  ]],
  ['apps/web/src/components/layout/SiteFooter.tsx', [
    'Non-commercial source available',
  ]],
])

const failures = []

for (const relativePath of currentSurfaces) {
  const absolutePath = resolve(repositoryRoot, relativePath)
  let content = readFileSync(absolutePath, 'utf8')

  // Preserve the published 0.1.0-alpha record. Only the current Unreleased
  // section participates in the release-state copy gate.
  if (relativePath === 'CHANGELOG.md') {
    content = content.split('\n## 0.1.0-alpha', 1)[0]
  }
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
