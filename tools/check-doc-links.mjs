import { access, readFile, readdir } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const scanRoots = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
  '.github/RELEASE_CHECKLIST.md',
  '.github/pull_request_template.md',
  'docs',
]

async function collect(path) {
  const absolute = resolve(root, path)
  const entry = await import('node:fs/promises').then(({ stat }) => stat(absolute))
  if (entry.isFile()) return extname(path) === '.md' ? [path] : []
  const children = await readdir(absolute, { withFileTypes: true })
  const nested = await Promise.all(children.map((child) => collect(`${path}/${child.name}`)))
  return nested.flat()
}

function markdownTargets(source) {
  return [...source.matchAll(/!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)]
    .map((match) => match[1].replace(/^<|>$/g, ''))
}

const files = (await Promise.all(scanRoots.map(collect))).flat().sort()
const failures = []
let checked = 0

for (const file of files) {
  const source = await readFile(resolve(root, file), 'utf8')
  for (const rawTarget of markdownTargets(source)) {
    if (
      rawTarget.startsWith('#')
      || rawTarget.startsWith('/')
      || /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)
    ) continue

    const pathname = decodeURIComponent(rawTarget.split('#', 1)[0])
    if (!pathname) continue
    const target = resolve(root, file, '..', pathname)
    const insideRepository = target === root || target.startsWith(`${root}${sep}`)
    if (!insideRepository) continue

    checked += 1
    try {
      await access(target)
    } catch {
      failures.push(`${file}: missing ${rawTarget}`)
    }
  }
}

if (failures.length > 0) {
  console.error(`Documentation link validation failed:\n${failures.join('\n')}`)
  process.exit(1)
}

console.log(`Documentation link validation passed for ${checked} local links in ${files.length} files.`)
