import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const backend = read('apps/backend/src/api/features/roadmaps/limit_schemas.py')
const requestLimits = read('apps/backend/src/api/shared/security/request_limits.py')
const frontend = 'apps/frontend/src'

function integerConstant(source, name) {
  const pattern = new RegExp(`^(?:export )?(?:const )?${name}\\s*=\\s*([\\d_]+(?:[ \\t]*\\*[ \\t]*[\\d_]+)*)[ \\t]*\\r?$`, 'm')
  const match = pattern.exec(source)
  assert.ok(match, `Missing integer constant ${name}`)
  return match[1].replaceAll('_', '').split('*').reduce((product, factor) => product * Number(factor), 1)
}

const importValidation = read(`${frontend}/features/roadmaps/lib/roadmap-validation.ts`)
const tagRegistry = read(`${frontend}/features/tags/lib/tag-registry.ts`)
const workspace = read(`${frontend}/features/workspace/components/Workspace.tsx`)
const taskLinks = read(`${frontend}/shared/domain/task-link-validation.ts`)

const importLimits = [
  'PHASES_MAX', 'TASKS_PER_PHASE_MAX', 'TASK_TITLE_MAX', 'TASK_DESC_MAX', 'TASK_EST_MAX',
  'TASK_TAGS_MAX', 'TASK_ASSIGNEES_MAX', 'TASK_DEPS_MAX', 'TAG_MAX', 'ASSIGNEE_MAX',
  'ID_MAX', 'PHASE_NAME_MAX', 'PHASE_NUM_MAX', 'PHASE_COLOR_MAX',
]
const mirrors = [
  ...importLimits.map((name) => [importValidation, name, name]),
  [tagRegistry, 'TAG_ID_MAX', 'TAG_MAX'],
  [tagRegistry, 'TAG_LABEL_MAX', 'TAG_LABEL_MAX'],
  [tagRegistry, 'TAG_REGISTRY_MAX', 'TAG_REGISTRY_MAX'],
  [workspace, 'ROADMAP_NAME_MAX', 'ROADMAP_NAME_MAX'],
  [taskLinks, 'TASK_LINKS_MAX', 'TASK_LINKS_MAX'],
]
for (const [source, frontendName, backendName] of mirrors) {
  assert.equal(integerConstant(source, frontendName), integerConstant(backend, backendName), `${frontendName} differs from backend ${backendName}`)
}

const nginx = read('deploy/self-hosted/nginx/roadforge.conf')
const nginxBodySize = /^\s*client_max_body_size\s+(\d+)m;/m.exec(nginx)
assert.ok(nginxBodySize, 'Expected nginx client_max_body_size in MiB')
const requestBodySize = integerConstant(requestLimits, 'REQUEST_BODY_MAX_BYTES')
assert.equal(integerConstant(importValidation, 'IMPORT_MAX_BYTES'), requestBodySize, 'Browser import and backend body size differ')
assert.equal(Number(nginxBodySize[1]) * 1024 * 1024, requestBodySize, 'Nginx and backend body size differ')

console.log(`Contract limits match for ${mirrors.length} frontend constants and the shared browser, backend, and nginx body limit.`)
