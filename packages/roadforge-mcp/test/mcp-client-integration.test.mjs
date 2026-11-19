import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'

import { createHttpHandler } from '../src/http-server.mjs'
import { createTeamJwt } from '../src/auth.mjs'
import { LATEST_PROTOCOL_VERSION } from '../src/server.mjs'

const TEST_SECRET = 'mcp-integration-test-secret-at-least-32-chars-xyz'

async function listen(t, handler) {
  const server = createServer(handler).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

/**
 * Genuine MCP Client over HTTP / SSE transport adhering to MCP specification.
 */
class GenuineMcpHttpClient {
  constructor({ baseUrl, authToken, roadmapId, sessionToken }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.authToken = authToken
    this.roadmapId = roadmapId
    this.sessionToken = sessionToken
    this.sessionId = null
    this.messageId = 1
    this.serverCapabilities = null
    this.protocolVersion = null
    this.sseAbortController = null
  }

  get headers() {
    return {
      'Content-Type': 'application/json',
      ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      ...(this.roadmapId ? { 'x-roadforge-roadmap-id': this.roadmapId } : {}),
      ...(this.sessionToken ? { 'x-roadforge-session-token': this.sessionToken } : {}),
      ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {}),
    }
  }

  async sendJsonRpc(method, params = undefined) {
    const id = this.messageId++
    const body = { jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) }
    const res = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    const newSessionId = res.headers.get('mcp-session-id')
    if (newSessionId) {
      this.sessionId = newSessionId
    }

    const json = await res.json()
    if (!res.ok || json.error) {
      const err = new Error(json.error?.message || `HTTP ${res.status}`)
      err.code = json.error?.code
      err.status = res.status
      err.response = json
      throw err
    }
    return json.result
  }

  async sendNotification(method, params = undefined) {
    const body = { jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) }
    const res = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })
    assert.equal(res.status, 204)
  }

  async connectSse() {
    this.sseAbortController = new AbortController()
    const res = await fetch(`${this.baseUrl}/sse`, {
      headers: {
        Accept: 'text/event-stream',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {}),
      },
      signal: this.sseAbortController.signal,
    })
    assert.equal(res.status, 200)
    const newSessionId = res.headers.get('mcp-session-id')
    if (newSessionId) {
      this.sessionId = newSessionId
    }
    this.sseReader = res.body.getReader()
    await this.sseReader.read()
    return res
  }

  disconnectSse() {
    if (this.sseReader) {
      this.sseReader.cancel().catch(() => {})
      this.sseReader = null
    }
    if (this.sseAbortController) {
      this.sseAbortController.abort()
      this.sseAbortController = null
    }
  }

  async initialize({ protocolVersion = LATEST_PROTOCOL_VERSION } = {}) {
    const result = await this.sendJsonRpc('initialize', {
      protocolVersion,
      capabilities: {
        roots: { listChanged: false },
        sampling: {},
      },
      clientInfo: {
        name: 'roadforge-test-client',
        version: '1.0.0',
      },
    })
    this.protocolVersion = result.protocolVersion
    this.serverCapabilities = result.capabilities
    await this.sendNotification('notifications/initialized')
    return result
  }

  async listTools() {
    const result = await this.sendJsonRpc('tools/list', {})
    return result.tools
  }

  async callTool(name, args = {}) {
    return await this.sendJsonRpc('tools/call', {
      name,
      arguments: args,
    })
  }
}

test('Genuine MCP Client: Complete lifecycle (init, tools list, tools call, protocol negotiation)', async (t) => {
  const disposableRoadmapId = 'rm_disposable_e2e_001'
  const disposableSessionToken = 'tok_disposable_editor_abc'

  const mockApiData = {
    roadmap: { id: disposableRoadmapId, name: 'Integration Roadmap', updated_at: '2026-11-19T10:00:00Z' },
    summary: {
      roadmap_id: disposableRoadmapId,
      roadmap_name: 'Integration Roadmap',
      updated_at: '2026-11-19T10:00:00Z',
      progress: { percent: 50, completed_tasks: 2, total_tasks: 4 },
      next_tasks: [{ id: 'tsk_1', title: 'Task 1', phase_id: 'ph_1' }],
    },
    tasks: [
      { id: 'tsk_1', title: 'Task 1', phase_id: 'ph_1', done: false },
      { id: 'tsk_2', title: 'Task 2', phase_id: 'ph_1', done: true },
    ],
  }

  const mockFetch = async (url, options = {}) => {
    const urlStr = String(url)
    if (urlStr.endsWith('/revision')) {
      return new Response(JSON.stringify({ roadmap_id: disposableRoadmapId, updated_at: '2026-11-19T10:00:00Z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (urlStr.endsWith('/summary')) {
      return new Response(JSON.stringify(mockApiData.summary), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (urlStr.includes('/tasks/search')) {
      return new Response(
        JSON.stringify({
          roadmap_id: disposableRoadmapId,
          updated_at: '2026-11-19T10:00:00Z',
          query: 'Task',
          matching_task_count: 1,
          returned_task_count: 1,
          omitted_task_count: 0,
          truncated: false,
          results: [
            {
              phase: { id: 'ph_1', name: 'Phase 1', color: '#10b981' },
              task: { id: 'tsk_1', title: 'Task 1', done: false },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
    return new Response(JSON.stringify(mockApiData.roadmap), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const teamToken = createTeamJwt({
    sub: 'usr_integration_runner',
    email: 'ci@anvilary.tools',
    secret: TEST_SECRET,
  })

  const handler = createHttpHandler({
    jwtSecret: TEST_SECRET,
    mode: 'team-gateway',
    fetchImpl: mockFetch,
    env: {
      ROADFORGE_MCP_MODE: 'team-gateway',
      ROADFORGE_MCP_JWT_SECRET: TEST_SECRET,
      ROADFORGE_API_URL: 'http://127.0.0.1:8000',
    },
  })
  const origin = await listen(t, handler)

  const client = new GenuineMcpHttpClient({
    baseUrl: origin,
    authToken: teamToken,
    roadmapId: disposableRoadmapId,
    sessionToken: disposableSessionToken,
  })

  // 1. Initialize
  const initResult = await client.initialize({ protocolVersion: '2025-11-25' })
  assert.equal(initResult.protocolVersion, '2025-11-25')
  assert.equal(initResult.serverInfo.name, 'roadforge')
  assert.ok(client.sessionId, 'Client should possess established session ID')

  // 2. Discover Tools
  const tools = await client.listTools()
  assert.ok(Array.isArray(tools))
  const toolNames = tools.map((t) => t.name)
  assert.ok(toolNames.includes('roadforge_summary'))
  assert.ok(toolNames.includes('roadforge_revision'))
  assert.ok(toolNames.includes('roadforge_task_search'))
  assert.ok(toolNames.includes('roadforge_get'))

  // 3. Execute Tool: roadforge_revision
  const revResult = await client.callTool('roadforge_revision', {})
  assert.equal(revResult.isError, false)
  assert.match(revResult.content[0].text, /2026-11-19T10:00:00Z/)

  // 4. Execute Tool: roadforge_summary
  const sumResult = await client.callTool('roadforge_summary', {})
  assert.equal(sumResult.isError, false)
  assert.match(sumResult.content[0].text, /Integration Roadmap/)

  // 5. Execute Tool: roadforge_task_search
  const searchResult = await client.callTool('roadforge_task_search', { query: 'Task' })
  assert.equal(searchResult.isError, false)
  assert.match(searchResult.content[0].text, /tsk_1/)
})

test('Genuine MCP Client: Session isolation between concurrent clients', async (t) => {
  const handler = createHttpHandler({
    env: { ROADFORGE_MCP_MODE: 'self-hosted' },
  })
  const origin = await listen(t, handler)

  const client1 = new GenuineMcpHttpClient({ baseUrl: origin })
  const client2 = new GenuineMcpHttpClient({ baseUrl: origin })

  // Client 1 initializes
  await client1.initialize()
  assert.ok(client1.sessionId)

  // Client 1 can list tools
  const tools1 = await client1.listTools()
  assert.ok(tools1.length > 0)

  // Client 2 attempts to call tools before initializing
  await assert.rejects(
    async () => {
      await client2.listTools()
    },
    (err) => {
      assert.equal(err.code, -32002)
      assert.match(err.message, /Server not initialized/)
      return true
    },
  )

  // Client 2 now initializes its own isolated session
  await client2.initialize()
  assert.ok(client2.sessionId)
  assert.notEqual(client1.sessionId, client2.sessionId, 'Sessions must be unique')

  const tools2 = await client2.listTools()
  assert.ok(tools2.length > 0)
})

test('Genuine MCP Client: Reconnect behavior across SSE and HTTP requests', async (t) => {
  const handler = createHttpHandler({
    env: { ROADFORGE_MCP_MODE: 'self-hosted' },
  })
  const origin = await listen(t, handler)

  const client = new GenuineMcpHttpClient({ baseUrl: origin })

  // 1. Establish SSE connection
  await client.connectSse()
  const sseSessionId = client.sessionId
  assert.ok(sseSessionId, 'SSE connection established sessionId')

  // 2. Initialize via POST /mcp referencing the SSE session
  await client.initialize()
  assert.equal(client.sessionId, sseSessionId, 'POST /mcp continues same session')

  // 3. Tool discovery succeeds
  const toolsBefore = await client.listTools()
  assert.ok(toolsBefore.length > 0)

  // 4. Simulate network disconnect / dropped SSE
  client.disconnectSse()

  // 5. Reconnect using same session ID
  const toolsAfter = await client.listTools()
  assert.ok(toolsAfter.length > 0)
  assert.equal(client.sessionId, sseSessionId, 'Session remained valid after reconnect')
})

test('Genuine MCP Client: Authentication failure rejection', async (t) => {
  const handler = createHttpHandler({
    jwtSecret: TEST_SECRET,
    mode: 'team-gateway',
    env: {
      ROADFORGE_MCP_MODE: 'team-gateway',
      ROADFORGE_MCP_JWT_SECRET: TEST_SECRET,
    },
  })
  const origin = await listen(t, handler)

  // Client without auth token
  const unauthClient = new GenuineMcpHttpClient({ baseUrl: origin })
  await assert.rejects(
    async () => {
      await unauthClient.initialize()
    },
    (err) => {
      assert.equal(err.status, 401)
      assert.match(err.message, /Valid team bearer token required/)
      return true
    },
  )

  // Client with forged token
  const badClient = new GenuineMcpHttpClient({
    baseUrl: origin,
    authToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJldmlsIn0.invalid-signature',
  })
  await assert.rejects(
    async () => {
      await badClient.initialize()
    },
    (err) => {
      assert.equal(err.status, 401)
      return true
    },
  )
})
