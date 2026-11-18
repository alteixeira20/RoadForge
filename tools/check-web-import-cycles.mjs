import { readFile, readdir } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import ts from '../apps/frontend/node_modules/typescript/lib/typescript.js'

const repositoryRoot = process.cwd()
const sourceRoot = resolve(repositoryRoot, 'apps/frontend/src')
const sourceExtensions = new Set(['.ts', '.tsx'])

// Each feature lists the lower-level modules it may use.
const dependencies = {
  shared: [],
  tags: ['shared'],
  roadmaps: ['tags', 'shared'],
  sharing: ['roadmaps', 'shared'],
  history: ['roadmaps', 'shared'],
  marketing: ['roadmaps', 'shared'],
  collaboration: ['sharing', 'shared'],
  'data-transfer': ['history', 'roadmaps', 'tags', 'shared'],
  tasks: ['collaboration', 'history', 'tags', 'shared'],
  phases: ['tasks', 'collaboration', 'roadmaps', 'shared'],
  synchronization: ['phases', 'tasks', 'collaboration', 'history', 'roadmaps', 'tags', 'shared'],
  workspace: [
    'synchronization', 'phases', 'tasks', 'collaboration', 'data-transfer',
    'sharing', 'history', 'roadmaps', 'tags', 'shared',
  ],
  app: ['workspace', 'synchronization', 'marketing', 'sharing', 'roadmaps', 'shared'],
  'middleware.ts': ['shared'],
}

function owner(file) {
  const [directory, feature] = relative(sourceRoot, file).split(sep)
  return directory === 'features' ? feature : directory
}

function isTest(file) {
  return file.split(sep).includes('__tests__') || /\.test\.tsx?$/.test(file)
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(path)
    return sourceExtensions.has(extname(entry.name)) ? [path] : []
  }))
  return nested.flat()
}

function importBase(importer, specifier) {
  if (specifier.startsWith('@/')) return resolve(sourceRoot, specifier.slice(2))
  if (specifier.startsWith('.')) return resolve(dirname(importer), specifier)
  return null
}

function sourceCandidates(base) {
  const extension = extname(base)
  if (sourceExtensions.has(extension)) return [base]
  if (extension === '.js' || extension === '.jsx') {
    const withoutExtension = base.slice(0, -extension.length)
    return [`${withoutExtension}.ts`, `${withoutExtension}.tsx`]
  }
  if (extension) return []
  return [
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
  ]
}

function displayPath(path) {
  return relative(repositoryRoot, path).split(sep).join('/')
}

const files = (await collectSourceFiles(sourceRoot)).sort()
const fileSet = new Set(files)
const graph = new Map(files.map((file) => [file, []]))
const unresolved = []
const boundaryViolations = []

for (const file of files) {
  const source = await readFile(file, 'utf8')
  const importerOwner = owner(file)
  const test = isTest(file)
  if (!test && !Object.hasOwn(dependencies, importerOwner)) {
    boundaryViolations.push(`${displayPath(file)} has no architecture owner`)
  }
  const imports = ts.preProcessFile(source, true, true).importedFiles
  for (const imported of imports) {
    const base = importBase(file, imported.fileName)
    if (!base) continue
    const candidates = sourceCandidates(base)
    if (candidates.length === 0) continue
    const target = candidates.find((candidate) => fileSet.has(candidate))
    if (target) {
      graph.get(file).push(target)
      const targetOwner = owner(target)
      if (!test && (
        isTest(target)
        || (targetOwner !== importerOwner && !dependencies[importerOwner]?.includes(targetOwner))
      )) {
        boundaryViolations.push(`${displayPath(file)} -> ${displayPath(target)}`)
      }
    } else {
      unresolved.push(`${displayPath(file)} -> ${imported.fileName}`)
    }
  }
}

if (unresolved.length > 0) {
  console.error(`Web import validation found unresolved internal imports:\n${unresolved.join('\n')}`)
  process.exit(1)
}

if (boundaryViolations.length > 0) {
  console.error(`Web architecture boundary violations:\n${boundaryViolations.join('\n')}`)
  process.exit(1)
}

const visiting = new Set()
const visited = new Set()
const stack = []
let cycle = null

function visit(file) {
  if (cycle || visited.has(file)) return
  if (visiting.has(file)) {
    const start = stack.indexOf(file)
    cycle = [...stack.slice(start), file]
    return
  }

  visiting.add(file)
  stack.push(file)
  for (const target of graph.get(file)) visit(target)
  stack.pop()
  visiting.delete(file)
  visited.add(file)
}

for (const file of files) visit(file)

if (cycle) {
  console.error(`Web import cycle detected:\n${cycle.map(displayPath).join(' -> ')}`)
  process.exit(1)
}

const edgeCount = [...graph.values()].reduce((total, targets) => total + targets.length, 0)
console.log(`Web import and architecture validation passed for ${files.length} files and ${edgeCount} internal imports.`)
