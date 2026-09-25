import assert from 'node:assert/strict'
import test from 'node:test'

import { TOOLS, createToolHandler } from '../src/server.mjs'

const UPDATED_AT = '2026-09-01T12:00:00Z'
const NEXT_UPDATED_AT = '2026-09-01T12:01:00Z'
const FULL_PATH = '/api/roadmaps/rm_test'

const fullRoadmap = {
  id: 'rm_test',
  name: 'Launch plan',
  updated_at: UPDATED_AT,
  phases: [{
    id: 'ph_1',
    num: '01',
    name: 'Build',
    status: 'active',
    progress: 0,
    tasks: [{
      id: 'tk_1',
      title: 'Ship alpha',
      done: false,
      next: true,
      tags: ['alpha'],
    }],
  }],
}

const summaryPayload = {
  roadmap_id: 'rm_test',
  name: 'Launch plan',
  updated_at: UPDATED_AT,
  phase_count: 1,
  total_task_count: 1,
  open_task_count: 1,
  completed_task_count: 0,
  completion_percent: 0,
  phases: [{
    id: 'ph_1',
    num: '01',
    name: 'Build',
    status: 'active',
    progress: 0,
    task_count: 1,
    completed_task_count: 0,
    open_task_count: 1,
  }],
  next_task_count: 1,
  next_tasks: [{
    id: 'tk_1',
    title: 'Ship alpha',
    phase_id: 'ph_1',
    phase_name: 'Build',
  }],
  next_tasks_truncated: false,
}

const taskPayload = {
  roadmap_id: 'rm_test',
  updated_at: UPDATED_AT,
  phase: {
    id: 'ph_1',
    num: '01',
    name: 'Build',
    status: 'active',
    progress: 0,
  },
  task: fullRoadmap.phases[0].tasks[0],
}

const searchPayload = {
  roadmap_id: 'rm_test',
  updated_at: UPDATED_AT,
  query: 'alpha',
  matching_task_count: 1,
  returned_task_count: 1,
  omitted_task_count: 0,
  truncated: false,
  results: [{
    phase: taskPayload.phase,
    task: {
      id: 'tk_1',
      title: 'Ship alpha',
      done: false,
      next: true,
      tags: ['alpha'],
      assignees: [],
    },
  }],
}

const contextPayload = {
  roadmap_id: 'rm_test',
  name: 'Launch plan',
  updated_at: UPDATED_AT,
  total_task_count: 1,
  completed_task_count: 0,
  open_task_count: 1,
  matching_task_count: 1,
  returned_task_count: 1,
  omitted_task_count: 0,
  truncated: false,
  results: [{
    phase: taskPayload.phase,
    task: {
      id: 'tk_1',
      title: 'Ship alpha',
      done: false,
      next: true,
      complexity: 'medium',
      est: null,
      parentId: null,
      deps: [],
      tags: ['alpha'],
      assignees: [],
      description_preview: null,
    },
  }],
}

function compactMutation(overrides = {}) {
  return {
    roadmap_id: 'rm_test',
    updated_at: NEXT_UPDATED_AT,
    affected_entity_type: 'task',
    affected_entity_id: 'tk_1',
    dependency_id: null,
    removed: false,
    phase: {
      id: 'ph_1',
      num: '01',
      name: 'Build',
      status: 'active',
      progress: 100,
      task_count: 1,
      completed_task_count: 1,
      open_task_count: 0,
    },
    task: {
      id: 'tk_1',
      title: 'Ship alpha',
      done: true,
      next: true,
      complexity: 'medium',
      est: null,
      parentId: null,
      deps: [],
      tags: ['alpha'],
      assignees: [],
    },
    tag: null,
    ...overrides,
  }
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function pathOf(url) {
  const parsed = new URL(url)
  return `${parsed.pathname}${parsed.search}`
}

function mockClient(handler = null) {
  const requests = []
  const fetchImpl = async (url, options = {}) => {
    const request = {
      method: options.method || 'GET',
      path: pathOf(url),
      headers: options.headers || {},
      body: options.body,
    }
    requests.push(request)
    if (handler) {
      const custom = await handler(request)
      if (custom) return custom
    }
    const pathname = new URL(url).pathname
    if (pathname === `${FULL_PATH}/summary`) return response(summaryPayload)
    if (pathname === `${FULL_PATH}/revision`) {
      return response({ roadmap_id: 'rm_test', updated_at: UPDATED_AT })
    }
    if (pathname === `${FULL_PATH}/tasks/search`) return response(searchPayload)
    if (pathname === `${FULL_PATH}/tasks/tk_1`) return response(taskPayload)
    if (pathname === `${FULL_PATH}/context`) return response(contextPayload)
    if (pathname === FULL_PATH) return response(fullRoadmap)
    if (pathname.startsWith(`${FULL_PATH}/client/`)) return response(compactMutation())
    throw new Error(`Unexpected request: ${request.method} ${request.path}`)
  }
  const call = createToolHandler({
    env: {
      ROADFORGE_API_URL: 'https://roadforge.test',
      ROADFORGE_ROADMAP_ID: 'rm_test',
      ROADFORGE_SESSION_TOKEN: 'secret-token',
    },
    fetchImpl,
  })
  return { call, requests }
}

function exactFullReads(requests) {
  return requests.filter((request) => request.method === 'GET' && request.path === FULL_PATH)
}

test('advertised tools cover solo roadmap work and omit claim coordination', () => {
  const names = TOOLS.map((tool) => tool.name)
  assert.deepEqual(names, [
    'roadforge_summary',
    'roadforge_revision',
    'roadforge_task_search',
    'roadforge_task_get',
    'roadforge_task_create',
    'roadforge_task_update',
    'roadforge_task_done',
    'roadforge_task_delete',
    'roadforge_dependency_add',
    'roadforge_dependency_remove',
    'roadforge_phase_create',
    'roadforge_phase_update',
    'roadforge_phase_delete',
    'roadforge_roadmap_rename',
    'roadforge_tag_create',
    'roadforge_get',
  ])
  assert.equal(TOOLS.find((tool) => tool.name === 'roadforge_task_delete').annotations.destructiveHint, true)
  assert.equal(TOOLS.find((tool) => tool.name === 'roadforge_phase_delete').annotations.destructiveHint, true)
  assert.equal(names.includes('roadforge_task_claim'), false)
  assert.equal(names.includes('roadforge_task_unclaim'), false)
})

test('focused summary revision search and task lookup never fetch the full roadmap', async () => {
  const { call, requests } = mockClient()

  assert.equal((await call('roadforge_summary', {})).isError, false)
  assert.equal((await call('roadforge_revision', {})).isError, false)
  assert.equal((await call('roadforge_task_search', { query: 'alpha' })).isError, false)
  assert.equal((await call('roadforge_task_get', { taskId: 'tk_1' })).isError, false)

  assert.deepEqual(requests.map((request) => request.method), ['GET', 'GET', 'GET', 'GET'])
  assert.match(requests[0].path, /^\/api\/roadmaps\/rm_test\/summary\?/)
  assert.equal(requests[1].path, `${FULL_PATH}/revision`)
  assert.match(requests[2].path, /^\/api\/roadmaps\/rm_test\/tasks\/search\?/)
  assert.equal(requests[3].path, `${FULL_PATH}/tasks/tk_1`)
  assert.equal(exactFullReads(requests).length, 0)
  assert.equal(requests[0].headers.Authorization, 'Bearer secret-token')
})

test('roadforge_get summary and compact are focused while full is the explicit escape hatch', async () => {
  const { call, requests } = mockClient()

  const summary = await call('roadforge_get', { mode: 'summary' })
  const compact = await call('roadforge_get', { mode: 'compact', maxTasks: 10 })
  assert.equal(summary.isError, false)
  assert.equal(compact.isError, false)
  assert.match(compact.content[0].text, /tk_1 \| Ship alpha/)
  assert.equal(exactFullReads(requests).length, 0)

  const full = await call('roadforge_get', { mode: 'full' })
  assert.equal(full.isError, false)
  assert.equal(full.structuredContent.id, 'rm_test')
  assert.equal(exactFullReads(requests).length, 1)
  assert.equal(requests.at(-1).path, FULL_PATH)
})

test('task update without expected revision uses revision then compact client route', async () => {
  const { call, requests } = mockClient()

  const result = await call('roadforge_task_update', {
    taskId: 'tk_1',
    title: 'Updated title',
  })

  assert.equal(result.isError, false)
  assert.deepEqual(requests.map((request) => [request.method, request.path]), [
    ['GET', `${FULL_PATH}/revision`],
    ['PATCH', `${FULL_PATH}/client/tasks/tk_1`],
  ])
  assert.equal(exactFullReads(requests).length, 0)
  assert.deepEqual(JSON.parse(requests[1].body), {
    title: 'Updated title',
    last_updated_at: UPDATED_AT,
  })
  assert.equal(result.structuredContent.roadmapId, 'rm_test')
  assert.equal(result.structuredContent.task.id, 'tk_1')
})

test('task update with expected revision performs only the compact mutation request', async () => {
  const { call, requests } = mockClient()

  await call('roadforge_task_update', {
    taskId: 'tk_1',
    estimate: '3d',
    expectedUpdatedAt: 'known-revision',
  })

  assert.deepEqual(requests.map((request) => [request.method, request.path]), [
    ['PATCH', `${FULL_PATH}/client/tasks/tk_1`],
  ])
  assert.equal(JSON.parse(requests[0].body).last_updated_at, 'known-revision')
  assert.equal(exactFullReads(requests).length, 0)
})

test('daily mutation tools use dedicated compact client routes', async () => {
  const { call, requests } = mockClient()

  await call('roadforge_task_create', { phaseId: 'ph_1', taskId: 'tk_2', title: 'Second' })
  await call('roadforge_task_done', {
    taskId: 'tk_1',
    done: true,
    expectedUpdatedAt: UPDATED_AT,
  })
  await call('roadforge_task_delete', { taskId: 'tk_1' })
  await call('roadforge_dependency_add', { taskId: 'tk_1', dependencyId: 'tk_2' })
  await call('roadforge_dependency_remove', { taskId: 'tk_1', dependencyId: 'tk_2' })
  await call('roadforge_phase_create', {
    phaseId: 'ph_2',
    name: 'Ship',
    color: 'blue',
  })
  await call('roadforge_phase_update', { phaseId: 'ph_2', name: 'Release' })
  await call('roadforge_phase_delete', { phaseId: 'ph_2' })
  await call('roadforge_roadmap_rename', { name: 'Renamed' })
  await call('roadforge_tag_create', {
    id: 'p0',
    label: 'P0',
    expectedUpdatedAt: UPDATED_AT,
  })

  assert.deepEqual(requests.map((request) => [request.method, request.path]), [
    ['POST', `${FULL_PATH}/client/phases/ph_1/tasks`],
    ['PATCH', `${FULL_PATH}/client/tasks/tk_1/done`],
    ['DELETE', `${FULL_PATH}/client/tasks/tk_1`],
    ['PUT', `${FULL_PATH}/client/tasks/tk_1/dependencies/tk_2`],
    ['DELETE', `${FULL_PATH}/client/tasks/tk_1/dependencies/tk_2`],
    ['POST', `${FULL_PATH}/client/phases`],
    ['PATCH', `${FULL_PATH}/client/phases/ph_2`],
    ['DELETE', `${FULL_PATH}/client/phases/ph_2`],
    ['PATCH', `${FULL_PATH}/client/name`],
    ['POST', `${FULL_PATH}/client/tags`],
  ])
  assert.equal(exactFullReads(requests).length, 0)
})

test('compact 409 conflict metadata remains useful without a server roadmap snapshot', async () => {
  const conflictPayload = {
    detail: 'Roadmap was updated by another session',
    code: 'roadmap_conflict',
    conflict: {
      roadmap_id: 'rm_test',
      server_updated_at: NEXT_UPDATED_AT,
      client_last_updated_at: UPDATED_AT,
      summary: { phase_count: 1, task_count: 1, phase_ids: [], task_ids: [] },
    },
  }
  const { call, requests } = mockClient((request) => {
    if (request.method === 'PATCH' && request.path === `${FULL_PATH}/client/tasks/tk_1`) {
      return response(conflictPayload, 409)
    }
    return null
  })

  const result = await call('roadforge_task_update', {
    taskId: 'tk_1',
    title: 'Stale',
    expectedUpdatedAt: UPDATED_AT,
  })

  assert.equal(result.isError, true)
  assert.equal(result.structuredContent.status, 409)
  assert.equal(result.structuredContent.conflict.serverUpdatedAt, NEXT_UPDATED_AT)
  assert.equal(result.structuredContent.conflict.clientUpdatedAt, UPDATED_AT)
  assert.deepEqual(result.structuredContent.conflict.summary.task_ids, [])
  assert.equal(JSON.stringify(result).includes('server"'), false)
  assert.equal(exactFullReads(requests).length, 0)
})

test('tool errors never expose the configured session token', async () => {
  const call = createToolHandler({
    env: {
      ROADFORGE_API_URL: 'https://roadforge.test',
      ROADFORGE_ROADMAP_ID: 'rm_test',
      ROADFORGE_SESSION_TOKEN: 'do-not-leak',
    },
    fetchImpl: async () => {
      throw new Error('network down')
    },
  })

  const result = await call('roadforge_summary', {})
  assert.equal(result.isError, true)
  assert.doesNotMatch(result.content[0].text, /do-not-leak/)
  assert.doesNotMatch(JSON.stringify(result.structuredContent), /do-not-leak/)
})
