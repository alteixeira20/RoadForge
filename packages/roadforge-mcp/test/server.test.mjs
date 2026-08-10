import assert from 'node:assert/strict'
import { once } from 'node:events'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { test } from 'node:test'

const roadmap = {
  id: 'rm_test',
  name: 'Launch plan',
  updated_at: '2026-08-03T20:00:00Z',
  phases: [{
    id: 'ph_1', num: '01', name: 'Build', progress: 0,
    tasks: [{ id: 'tk_1', title: 'Ship alpha', done: false, next: true, tags: ['alpha'] }],
  }],
}

async function mockApi() {
  const requests = []
  const server = http.createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    requests.push({ method: request.method, url: request.url, headers: request.headers, body })
    const next = request.method === 'GET'
      ? roadmap
      : { ...roadmap, updated_at: '2026-08-03T20:01:00Z', phases: [{ ...roadmap.phases[0], progress: 100, tasks: [{ ...roadmap.phases[0].tasks[0], done: true }] }] }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(next))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, requests, url: `http://127.0.0.1:${server.address().port}` }
}

function lineReader(stream) {
  let buffer = ''
  const waiters = []
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n')
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      waiters.shift()?.(JSON.parse(line))
    }
  })
  return () => new Promise((resolve) => waiters.push(resolve))
}

function send(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`)
}

test('stdio server initializes, lists tools, and performs revision-safe writes', async (t) => {
  const api = await mockApi()
  t.after(() => api.server.close())
  const child = spawn(process.execPath, ['bin/roadforge-mcp.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      ROADFORGE_API_URL: api.url,
      ROADFORGE_ROADMAP_ID: 'rm_test',
      ROADFORGE_SESSION_TOKEN: 'secret-token',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  t.after(() => child.kill())
  const nextLine = lineReader(child.stdout)

  send(child, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })
  const initialized = await nextLine()
  assert.equal(initialized.result.protocolVersion, '2025-11-25')
  assert.deepEqual(initialized.result.capabilities, { tools: { listChanged: false } })

  send(child, { jsonrpc: '2.0', method: 'notifications/initialized' })
  send(child, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
  const listed = await nextLine()
  assert.ok(listed.result.tools.some((tool) => tool.name === 'roadforge_task_done'))

  send(child, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'roadforge_get', arguments: { mode: 'compact' } } })
  const read = await nextLine()
  assert.match(read.result.content[0].text, /tk_1 \| Ship alpha/)
  assert.equal(read.result.structuredContent.taskCount, 1)

  send(child, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'roadforge_task_done', arguments: { taskId: 'tk_1', done: true } } })
  const written = await nextLine()
  assert.equal(written.result.isError, false)
  assert.equal(written.result.structuredContent.task.done, true)

  assert.equal(api.requests[0].headers.authorization, 'Bearer secret-token')
  const patch = api.requests.find((entry) => entry.method === 'PATCH')
  assert.deepEqual(JSON.parse(patch.body), {
    done: true,
    last_updated_at: '2026-08-03T20:00:00Z',
  })
})

test('tool errors never expose the configured token', async () => {
  const { createToolHandler } = await import('../src/server.mjs')
  const call = createToolHandler({
    env: {
      ROADFORGE_API_URL: 'http://invalid.test',
      ROADFORGE_ROADMAP_ID: 'rm_test',
      ROADFORGE_SESSION_TOKEN: 'do-not-leak',
    },
    fetchImpl: async () => { throw new Error('network down') },
  })
  const result = await call('roadforge_get', {})
  assert.equal(result.isError, true)
  assert.doesNotMatch(result.content[0].text, /do-not-leak/)
})


test('invite credentials join once and remain in memory for the process', async () => {
  const requests = []
  const { createToolHandler } = await import('../src/server.mjs')
  const call = createToolHandler({
    env: {
      ROADFORGE_API_URL: 'https://roadforge.test',
      ROADFORGE_INVITE_URL: 'https://roadforge.test/join?token=ed_invite',
      ROADFORGE_DISPLAY_NAME: 'Build Agent',
    },
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options })
      if (url.endsWith('/api/roadmaps/join')) {
        return new Response(JSON.stringify({
          roadmap_id: 'rm_test',
          roadmap_name: 'Launch plan',
          role: 'editor',
          session_token: 'sess_joined',
          participant_id: 'pt_agent',
        }), { status: 200 })
      }
      return new Response(JSON.stringify(roadmap), { status: 200 })
    },
  })

  assert.equal((await call('roadforge_get', { mode: 'summary' })).isError, false)
  assert.equal((await call('roadforge_get', { mode: 'summary' })).isError, false)

  const joins = requests.filter((entry) => entry.url.endsWith('/api/roadmaps/join'))
  assert.equal(joins.length, 1)
  assert.deepEqual(JSON.parse(joins[0].options.body), {
    token: 'ed_invite',
    display_name: 'Build Agent',
  })
  const reads = requests.filter((entry) => entry.url.endsWith('/api/roadmaps/rm_test'))
  assert.equal(reads.length, 2)
  assert.equal(reads[0].options.headers.Authorization, 'Bearer sess_joined')
})

test('summary defaults and targeted task reads avoid full roadmap payloads', async () => {
  const { createToolHandler } = await import('../src/server.mjs')
  const call = createToolHandler({
    env: {
      ROADFORGE_API_URL: 'https://roadforge.test',
      ROADFORGE_ROADMAP_ID: 'rm_test',
      ROADFORGE_SESSION_TOKEN: 'sess_test',
    },
    fetchImpl: async () => new Response(JSON.stringify(roadmap), { status: 200 }),
  })

  const summary = await call('roadforge_get', {})
  assert.equal(summary.isError, false)
  assert.equal(summary.structuredContent.taskCount, 1)
  assert.equal(summary.structuredContent.phases[0].id, 'ph_1')
  assert.doesNotMatch(summary.content[0].text, /Ship alpha.*alpha/s)

  const task = await call('roadforge_task_get', { taskId: 'tk_1' })
  assert.equal(task.isError, false)
  assert.equal(task.structuredContent.task.title, 'Ship alpha')
  assert.equal(task.structuredContent.phase.id, 'ph_1')

  const search = await call('roadforge_task_search', { query: 'alpha' })
  assert.equal(search.isError, false)
  assert.equal(search.structuredContent.matchingTaskCount, 1)
  assert.equal(search.structuredContent.results[0].task.id, 'tk_1')
})

test('compact reads omit descriptions by default and report bounded truncation', async () => {
  const { compactRoadmap } = await import('../src/roadforge-client.mjs')
  const longDescription = `Sensitive context ${'x'.repeat(500)}`
  const largeRoadmap = {
    ...roadmap,
    phases: [{
      ...roadmap.phases[0],
      tasks: [
        { ...roadmap.phases[0].tasks[0], desc: longDescription },
        { id: 'tk_2', title: 'Second task', done: false },
        { id: 'tk_3', title: 'Completed task', done: true },
      ],
    }],
  }

  const defaultCompact = compactRoadmap(largeRoadmap, { maxTasks: 1 })
  assert.doesNotMatch(defaultCompact.text, /Sensitive context/)
  assert.equal(defaultCompact.selection.matchingTaskCount, 3)
  assert.equal(defaultCompact.selection.returnedTaskCount, 1)
  assert.equal(defaultCompact.selection.omittedTaskCount, 2)
  assert.equal(defaultCompact.selection.truncated, true)
  assert.match(defaultCompact.text, /2 matching task\(s\) omitted/)

  const withDescription = compactRoadmap(largeRoadmap, {
    taskIds: ['tk_1'],
    includeDescriptions: true,
    maxTasks: 10,
  })
  assert.match(withDescription.text, /Sensitive context/)
  assert.match(withDescription.text, /…/)
  assert.ok(withDescription.text.length < longDescription.length)
})
