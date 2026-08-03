import readline from 'node:readline'
import {
  RoadForgeApiError,
  compactRoadmap,
  compactWriteResult,
  createRoadForgeClient,
  roadmapSummary,
  searchRoadmapTasks,
  taskDetails,
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
  description: 'Optional exact updated_at value from a prior read. Omit to fetch the current revision first.',
}

export const TOOLS = [
  {
    name: 'roadforge_get',
    title: 'Read Roadmap',
    description: 'Read the configured roadmap. Summary mode is the lowest-token overview; compact mode supports bounded filters.',
    inputSchema: objectSchema({
      mode: {
        type: 'string',
        enum: ['summary', 'compact', 'full'],
        default: 'summary',
        description: 'summary JSON, filtered compact text, or the full portable roadmap',
      },
      phaseIds: { type: 'array', items: { type: 'string' }, maxItems: 50 },
      taskIds: { type: 'array', items: { type: 'string' }, maxItems: 100 },
      openOnly: { type: 'boolean', default: false },
      nextOnly: { type: 'boolean', default: false },
      includeDescriptions: { type: 'boolean', default: false, description: 'Compact mode only. Descriptions are capped at 240 characters.' },
      maxTasks: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_task_get',
    title: 'Read Task',
    description: 'Read one task and its phase by stable task ID.',
    inputSchema: objectSchema({
      taskId: { type: 'string', minLength: 1 },
    }, ['taskId']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_task_search',
    title: 'Search Tasks',
    description: 'Search task IDs, titles, descriptions, phase names, tags, and assignees without returning the full roadmap.',
    inputSchema: objectSchema({
      query: { type: 'string', minLength: 1, maxLength: 200 },
      includeCompleted: { type: 'boolean', default: false },
      maxResults: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }, ['query']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_task_update',
    title: 'Update Task',
    description: 'Update planning fields on one task without replacing the roadmap.',
    inputSchema: objectSchema({
      taskId: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1, maxLength: 160 },
      description: { type: ['string', 'null'], maxLength: 5000 },
      estimate: { type: ['string', 'null'], maxLength: 64 },
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
    description: 'Mark one task complete or reopen it using optimistic concurrency.',
    inputSchema: objectSchema({
      taskId: { type: 'string', minLength: 1 },
      done: { type: 'boolean' },
      expectedUpdatedAt: revisionProperty,
    }, ['taskId', 'done']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_task_claim',
    title: 'Claim Task',
    description: 'Claim a task for the configured RoadForge participant.',
    inputSchema: objectSchema({
      taskId: { type: 'string', minLength: 1 },
      override: { type: 'boolean', default: false, description: 'Owners may explicitly replace another claim.' },
    }, ['taskId']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_task_unclaim',
    title: 'Release Task Claim',
    description: 'Release the configured participant claim from a task.',
    inputSchema: objectSchema({
      taskId: { type: 'string', minLength: 1 },
      override: { type: 'boolean', default: false, description: 'Owners may explicitly clear another claim.' },
    }, ['taskId']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'roadforge_tag_create',
    title: 'Create Tag Definition',
    description: 'Create label/color metadata for a stable task tag ID.',
    inputSchema: objectSchema({
      id: { type: 'string', minLength: 1, maxLength: 40 },
      label: { type: 'string', minLength: 1, maxLength: 80 },
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      expectedUpdatedAt: revisionProperty,
    }, ['label']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
]

function assertObject(value, name = 'arguments') {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`)
  }
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
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}

function optionalBoolean(value, name, fallback = false) {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`)
  return value
}

function toolResult(value, text = JSON.stringify(value)) {
  return {
    content: [{ type: 'text', text }],
    structuredContent: value,
    isError: false,
  }
}

function toolError(error) {
  const conflict = error instanceof RoadForgeApiError && error.status === 409
  const detail = {
    error: error.message,
    ...(error instanceof RoadForgeApiError && error.status ? { status: error.status } : {}),
    ...(conflict && error.payload?.conflict
      ? {
          conflict: {
            serverUpdatedAt: error.payload.conflict.server_updated_at,
            clientUpdatedAt: error.payload.conflict.client_last_updated_at,
            summary: error.payload.conflict.summary,
          },
        }
      : {}),
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(detail) }],
    structuredContent: detail,
    isError: true,
  }
}

export function createToolHandler(options = {}) {
  const client = createRoadForgeClient(options)

  return async function callTool(name, rawArguments) {
    const args = assertObject(rawArguments)
    try {
      switch (name) {
        case 'roadforge_get': {
          const mode = args.mode || 'summary'
          if (!['summary', 'compact', 'full'].includes(mode)) throw new TypeError('mode is invalid')
          const roadmap = await client.getRoadmap()
          if (mode === 'summary') return toolResult(roadmapSummary(roadmap))
          if (mode === 'full') return toolResult(roadmap)

          const compact = compactRoadmap(roadmap, {
            phaseIds: optionalStringArray(args.phaseIds, 'phaseIds', 50),
            taskIds: optionalStringArray(args.taskIds, 'taskIds', 100),
            openOnly: optionalBoolean(args.openOnly, 'openOnly'),
            nextOnly: optionalBoolean(args.nextOnly, 'nextOnly'),
            includeDescriptions: optionalBoolean(args.includeDescriptions, 'includeDescriptions'),
            maxTasks: boundedInteger(args.maxTasks, 'maxTasks', 200, 1, 500),
          })
          return toolResult({ ...roadmapSummary(roadmap), selection: compact.selection }, compact.text)
        }
        case 'roadforge_task_get': {
          const taskId = requiredString(args.taskId, 'taskId')
          const details = taskDetails(await client.getRoadmap(), taskId)
          if (!details) throw new TypeError(`task ${taskId} was not found`)
          return toolResult(details)
        }
        case 'roadforge_task_search': {
          const query = requiredString(args.query, 'query')
          if (query.length > 200) throw new TypeError('query must be at most 200 characters')
          const result = searchRoadmapTasks(await client.getRoadmap(), query, {
            includeCompleted: optionalBoolean(args.includeCompleted, 'includeCompleted'),
            maxResults: boundedInteger(args.maxResults, 'maxResults', 20, 1, 100),
          })
          return toolResult(result)
        }
        case 'roadforge_task_update': {
          const taskId = requiredString(args.taskId, 'taskId')
          const fields = {}
          if ('title' in args) fields.title = requiredString(args.title, 'title')
          if ('description' in args) fields.desc = args.description
          if ('estimate' in args) fields.est = args.estimate
          if ('assignees' in args) fields.assignees = args.assignees
          if ('tags' in args) fields.tags = args.tags
          if ('links' in args) fields.links = args.links
          if (!Object.keys(fields).length) throw new TypeError('provide at least one task field')
          const roadmap = await client.updateTask(taskId, fields, args.expectedUpdatedAt)
          return toolResult(compactWriteResult(roadmap, taskId))
        }
        case 'roadforge_task_done': {
          const taskId = requiredString(args.taskId, 'taskId')
          if (typeof args.done !== 'boolean') throw new TypeError('done must be a boolean')
          const roadmap = await client.setTaskDone(taskId, args.done, args.expectedUpdatedAt)
          return toolResult(compactWriteResult(roadmap, taskId))
        }
        case 'roadforge_task_claim':
        case 'roadforge_task_unclaim': {
          const taskId = requiredString(args.taskId, 'taskId')
          const roadmap = await client.setTaskClaim(
            taskId,
            name === 'roadforge_task_claim',
            Boolean(args.override),
          )
          return toolResult(compactWriteResult(roadmap, taskId))
        }
        case 'roadforge_tag_create': {
          const roadmap = await client.createTag({
            ...(args.id ? { id: requiredString(args.id, 'id') } : {}),
            label: requiredString(args.label, 'label'),
            ...(args.color ? { color: args.color } : {}),
            expectedUpdatedAt: args.expectedUpdatedAt,
          })
          return toolResult({ roadmapId: roadmap.id, updatedAt: roadmap.updated_at })
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
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  }
}

export function createMessageHandler(options = {}) {
  const callTool = createToolHandler(options)
  let initializeSeen = false

  return async function handle(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return errorResponse(null, -32600, 'Invalid Request')
    }
    if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return errorResponse(message.id ?? null, -32600, 'Invalid Request')
    }

    const isNotification = message.id === undefined
    if (isNotification) {
      if (message.method === 'notifications/initialized') initializeSeen = true
      return null
    }

    if (message.method === 'initialize') {
      const requested = message.params?.protocolVersion
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested)
        ? requested
        : LATEST_PROTOCOL_VERSION
      initializeSeen = true
      return response(message.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: 'roadforge',
          title: 'RoadForge MCP',
          version: SERVER_VERSION,
          description: 'Token-efficient RoadForge roadmap tools over stdio.',
          websiteUrl: 'https://roadforge.anvilary.tools',
        },
        instructions:
          'Start with summary reads, then use task search/get or filtered compact reads. Preserve updatedAt and pass it as expectedUpdatedAt when coordinating several writes.',
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
      process.stderr.write(`RoadForge MCP internal error: ${error.stack || error.message}\n`)
    })
  })
}
