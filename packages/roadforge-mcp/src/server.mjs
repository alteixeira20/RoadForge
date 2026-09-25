import readline from 'node:readline'
import {
  RoadForgeApiError,
  compactContextText,
  createRoadForgeClient,
} from './roadforge-client.mjs'

export const SERVER_VERSION = '0.1.0-alpha.0'
export const LATEST_PROTOCOL_VERSION = '2025-11-25'

const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  LATEST_PROTOCOL_VERSION,
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
])

const objectSchema = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
})

const revisionProperty = {
  type: 'string',
  description: 'Optional exact updated_at from a prior read. Omit to use the lightweight revision endpoint immediately before writing.',
}

const taskIdProperty = { type: 'string', minLength: 1, maxLength: 160 }
const phaseIdProperty = { type: 'string', minLength: 1, maxLength: 160 }

export const TOOLS = [
  {
    name: 'roadforge_summary',
    title: 'Roadmap Summary',
    description: 'Read roadmap status, revision, phase progress, and bounded next tasks without downloading the roadmap.',
    inputSchema: objectSchema({ maxNext: { type: 'integer', minimum: 1, maximum: 50, default: 20 } }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_revision',
    title: 'Roadmap Revision',
    description: 'Read only the current roadmap updatedAt concurrency token.',
    inputSchema: objectSchema(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_task_search',
    title: 'Search Tasks',
    description: 'Server-side search across task IDs, titles, descriptions, phase names/IDs, tags, and assignees.',
    inputSchema: objectSchema({
      query: { type: 'string', minLength: 1, maxLength: 200 },
      includeCompleted: { type: 'boolean', default: false },
      maxResults: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }, ['query']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_task_get',
    title: 'Read Task',
    description: 'Read one full task and compact phase context by stable task ID.',
    inputSchema: objectSchema({ taskId: taskIdProperty }, ['taskId']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_task_create',
    title: 'Create Task',
    description: 'Create one task in a phase using a stable caller-provided task ID.',
    inputSchema: objectSchema({
      phaseId: phaseIdProperty,
      taskId: taskIdProperty,
      title: { type: 'string', minLength: 1, maxLength: 160 },
      parentId: { type: ['string', 'null'], maxLength: 160 },
    }, ['phaseId', 'taskId', 'title']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'roadforge_task_update',
    title: 'Update Task',
    description: 'Update planning fields on one task with optimistic concurrency and a compact acknowledgement.',
    inputSchema: objectSchema({
      taskId: taskIdProperty,
      title: { type: 'string', minLength: 1, maxLength: 160 },
      description: { type: ['string', 'null'], maxLength: 5000 },
      estimate: { type: ['string', 'null'], maxLength: 64 },
      complexity: { type: 'string', enum: ['very_low', 'low', 'medium', 'high', 'very_high'] },
      assignees: { type: 'array', items: { type: 'string' }, maxItems: 20 },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
      links: { type: 'array', items: { type: 'object' }, maxItems: 20 },
      expectedUpdatedAt: revisionProperty,
    }, ['taskId']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_task_done',
    title: 'Set Task Completion',
    description: 'Complete or reopen one task with optimistic concurrency and a compact acknowledgement.',
    inputSchema: objectSchema({
      taskId: taskIdProperty,
      done: { type: 'boolean' },
      expectedUpdatedAt: revisionProperty,
    }, ['taskId', 'done']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_task_delete',
    title: 'Delete Task',
    description: 'Delete one task using RoadForge task-structure semantics. Existing descendant/dependency rules still apply.',
    inputSchema: objectSchema({ taskId: taskIdProperty }, ['taskId']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'roadforge_dependency_add',
    title: 'Add Dependency',
    description: 'Add one validated task dependency edge.',
    inputSchema: objectSchema({ taskId: taskIdProperty, dependencyId: taskIdProperty }, ['taskId', 'dependencyId']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_dependency_remove',
    title: 'Remove Dependency',
    description: 'Remove one task dependency edge.',
    inputSchema: objectSchema({ taskId: taskIdProperty, dependencyId: taskIdProperty }, ['taskId', 'dependencyId']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_phase_create',
    title: 'Create Phase',
    description: 'Create one empty phase using a stable caller-provided phase ID.',
    inputSchema: objectSchema({
      phaseId: phaseIdProperty,
      name: { type: 'string', minLength: 1, maxLength: 160 },
      color: { type: 'string', minLength: 1, maxLength: 64 },
      colorMode: { type: 'string', enum: ['auto', 'manual'], default: 'auto' },
    }, ['phaseId', 'name', 'color']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'roadforge_phase_update',
    title: 'Update Phase',
    description: 'Update phase name/color metadata through the focused phase service.',
    inputSchema: objectSchema({
      phaseId: phaseIdProperty,
      name: { type: 'string', minLength: 1, maxLength: 160 },
      color: { type: 'string', minLength: 1, maxLength: 64 },
      colorMode: { type: 'string', enum: ['auto', 'manual'] },
    }, ['phaseId']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_phase_delete',
    title: 'Delete Phase',
    description: 'Delete one phase using the existing RoadForge phase deletion rules.',
    inputSchema: objectSchema({ phaseId: phaseIdProperty }, ['phaseId']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'roadforge_roadmap_rename',
    title: 'Rename Roadmap',
    description: 'Rename the configured roadmap without replacing its phases or tasks.',
    inputSchema: objectSchema({ name: { type: 'string', minLength: 1, maxLength: 160 } }, ['name']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_tag_create',
    title: 'Create Tag Definition',
    description: 'Create tag label/color metadata using the existing tag service.',
    inputSchema: objectSchema({
      id: { type: 'string', minLength: 1, maxLength: 40 },
      label: { type: 'string', minLength: 1, maxLength: 80 },
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      expectedUpdatedAt: revisionProperty,
    }, ['label']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'roadforge_get',
    title: 'Read Roadmap Context',
    description: 'Compatibility read: focused summary, bounded compact context, or explicit full portable roadmap JSON escape hatch.',
    inputSchema: objectSchema({
      mode: { type: 'string', enum: ['summary', 'compact', 'full'], default: 'summary' },
      phaseIds: { type: 'array', items: { type: 'string' }, maxItems: 50 },
      taskIds: { type: 'array', items: { type: 'string' }, maxItems: 100 },
      openOnly: { type: 'boolean', default: false },
      nextOnly: { type: 'boolean', default: false },
      includeDescriptions: { type: 'boolean', default: false },
      maxTasks: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
]

function assertObject(value, name = 'arguments') {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`)
  return value
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required`)
  return value.trim()
}

function optionalStringArray(value, name, maxItems) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new TypeError(`${name} must be an array of at most ${maxItems} non-empty strings`)
  }
  return [...new Set(value.map((item) => item.trim()))]
}

function boundedInteger(value, name, fallback, minimum, maximum) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}`)
  return value
}

function optionalBoolean(value, name, fallback = false) {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`)
  return value
}

function toolResult(value, text = JSON.stringify(value)) {
  return { content: [{ type: 'text', text }], structuredContent: value, isError: false }
}

function toolError(error) {
  const conflict = error instanceof RoadForgeApiError && error.status === 409
  const source = error.payload?.conflict
  const detail = {
    error: error.message,
    ...(error instanceof RoadForgeApiError && error.status ? { status: error.status } : {}),
    ...(conflict && source
      ? {
          conflict: {
            roadmapId: source.roadmap_id,
            serverUpdatedAt: source.server_updated_at,
            clientUpdatedAt: source.client_last_updated_at,
            summary: source.summary ?? null,
          },
        }
      : {}),
  }
  return { content: [{ type: 'text', text: JSON.stringify(detail) }], structuredContent: detail, isError: true }
}

function optionalTaskUpdate(args) {
  const fields = {}
  if ('title' in args) fields.title = requiredString(args.title, 'title')
  if ('description' in args) fields.desc = args.description
  if ('estimate' in args) fields.est = args.estimate
  if ('complexity' in args) fields.complexity = args.complexity
  if ('assignees' in args) fields.assignees = args.assignees
  if ('tags' in args) fields.tags = args.tags
  if ('links' in args) fields.links = args.links
  if (!Object.keys(fields).length) throw new TypeError('provide at least one task field')
  return fields
}

export function createToolHandler(options = {}) {
  const client = createRoadForgeClient(options)

  return async function callTool(name, rawArguments) {
    const args = assertObject(rawArguments)
    try {
      switch (name) {
        case 'roadforge_summary':
          return toolResult(await client.getSummary(boundedInteger(args.maxNext, 'maxNext', 20, 1, 50)))
        case 'roadforge_revision':
          return toolResult(await client.getRevision())
        case 'roadforge_task_search': {
          const query = requiredString(args.query, 'query')
          if (query.length > 200) throw new TypeError('query must be at most 200 characters')
          return toolResult(await client.searchTasks(query, {
            includeCompleted: optionalBoolean(args.includeCompleted, 'includeCompleted'),
            maxResults: boundedInteger(args.maxResults, 'maxResults', 20, 1, 100),
          }))
        }
        case 'roadforge_task_get':
          return toolResult(await client.getTask(requiredString(args.taskId, 'taskId')))
        case 'roadforge_task_create':
          return toolResult(await client.createTask(
            requiredString(args.phaseId, 'phaseId'),
            {
              id: requiredString(args.taskId, 'taskId'),
              title: requiredString(args.title, 'title'),
              ...('parentId' in args && args.parentId !== null ? { parentId: requiredString(args.parentId, 'parentId') } : {}),
            },
          ))
        case 'roadforge_task_update':
          return toolResult(await client.updateTask(
            requiredString(args.taskId, 'taskId'),
            optionalTaskUpdate(args),
            args.expectedUpdatedAt,
          ))
        case 'roadforge_task_done':
          if (typeof args.done !== 'boolean') throw new TypeError('done must be a boolean')
          return toolResult(await client.setTaskDone(requiredString(args.taskId, 'taskId'), args.done, args.expectedUpdatedAt))
        case 'roadforge_task_delete':
          return toolResult(await client.deleteTask(requiredString(args.taskId, 'taskId')))
        case 'roadforge_dependency_add':
        case 'roadforge_dependency_remove':
          return toolResult(await client.setDependency(
            requiredString(args.taskId, 'taskId'),
            requiredString(args.dependencyId, 'dependencyId'),
            name === 'roadforge_dependency_add',
          ))
        case 'roadforge_phase_create':
          return toolResult(await client.createPhase({
            id: requiredString(args.phaseId, 'phaseId'),
            name: requiredString(args.name, 'name'),
            color: requiredString(args.color, 'color'),
            colorMode: args.colorMode || 'auto',
          }))
        case 'roadforge_phase_update': {
          const phaseId = requiredString(args.phaseId, 'phaseId')
          const fields = {}
          if ('name' in args) fields.name = requiredString(args.name, 'name')
          if ('color' in args) fields.color = requiredString(args.color, 'color')
          if ('colorMode' in args) fields.colorMode = args.colorMode
          if (!Object.keys(fields).length) throw new TypeError('provide at least one phase field')
          return toolResult(await client.updatePhase(phaseId, fields))
        }
        case 'roadforge_phase_delete':
          return toolResult(await client.deletePhase(requiredString(args.phaseId, 'phaseId')))
        case 'roadforge_roadmap_rename':
          return toolResult(await client.renameRoadmap(requiredString(args.name, 'name')))
        case 'roadforge_tag_create':
          return toolResult(await client.createTag({
            ...(args.id ? { id: requiredString(args.id, 'id') } : {}),
            label: requiredString(args.label, 'label'),
            ...(args.color ? { color: args.color } : {}),
            expectedUpdatedAt: args.expectedUpdatedAt,
          }))
        case 'roadforge_get': {
          const mode = args.mode || 'summary'
          if (!['summary', 'compact', 'full'].includes(mode)) throw new TypeError('mode is invalid')
          if (mode === 'summary') return toolResult(await client.getSummary())
          if (mode === 'full') return toolResult(await client.getRoadmap())
          const context = await client.getContext({
            phaseIds: optionalStringArray(args.phaseIds, 'phaseIds', 50),
            taskIds: optionalStringArray(args.taskIds, 'taskIds', 100),
            openOnly: optionalBoolean(args.openOnly, 'openOnly'),
            nextOnly: optionalBoolean(args.nextOnly, 'nextOnly'),
            includeDescriptions: optionalBoolean(args.includeDescriptions, 'includeDescriptions'),
            maxTasks: boundedInteger(args.maxTasks, 'maxTasks', 200, 1, 500),
          })
          return toolResult(context, compactContextText(context))
        }
        default:
          throw Object.assign(new Error(`Unknown tool: ${name}`), { protocolError: true })
      }
    } catch (error) {
      if (error?.protocolError) throw error
      return toolError(error)
    }
  }
}

function response(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function errorResponse(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } }
}

export function createMessageHandler(options = {}) {
  const callTool = createToolHandler(options)
  let initializeSeen = false
  return async function handle(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return errorResponse(null, -32600, 'Invalid Request')
    if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') return errorResponse(message.id ?? null, -32600, 'Invalid Request')
    const isNotification = message.id === undefined
    if (isNotification) {
      if (message.method === 'notifications/initialized') initializeSeen = true
      return null
    }
    if (message.method === 'initialize') {
      const requested = message.params?.protocolVersion
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : LATEST_PROTOCOL_VERSION
      initializeSeen = true
      return response(message.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: 'roadforge',
          title: 'RoadForge MCP',
          version: SERVER_VERSION,
          description: 'Focused local-first RoadForge roadmap tools over stdio.',
          websiteUrl: 'https://roadforge.anvilary.tools',
        },
        instructions: 'Start with roadforge_summary or task search/get. Normal operations use focused API routes and compact acknowledgements; request roadforge_get mode=full only when portable roadmap JSON is explicitly required.',
      })
    }
    if (message.method === 'ping') return response(message.id, {})
    if (!initializeSeen) return errorResponse(message.id, -32002, 'Server not initialized')
    if (message.method === 'tools/list') return response(message.id, { tools: TOOLS })
    if (message.method === 'tools/call') {
      const name = message.params?.name
      if (typeof name !== 'string') return errorResponse(message.id, -32602, 'Tool name is required')
      try {
        return response(message.id, await callTool(name, message.params?.arguments))
      } catch (error) {
        return errorResponse(message.id, -32602, error.message)
      }
    }
    return errorResponse(message.id, -32601, `Method not found: ${message.method}`)
  }
}

export function runStdioServer(options = {}) {
  const handle = createMessageHandler(options)
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  let chain = Promise.resolve()
  input.on('line', (line) => {
    if (!line.trim()) return
    chain = chain.then(async () => {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        process.stdout.write(`${JSON.stringify(errorResponse(null, -32700, 'Parse error'))}\n`)
        return
      }
      const result = await handle(message)
      if (result) process.stdout.write(`${JSON.stringify(result)}\n`)
    }).catch((error) => {
      process.stderr.write(`RoadForge MCP request failed: ${error.message}\n`)
    })
  })
}
