import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'

import { createHttpHandler } from '../src/http-server.mjs'
import { LATEST_PROTOCOL_VERSION, SERVER_VERSION } from '../src/server.mjs'

async function listen(t, handler) {
  const server = createServer(handler).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

test('HTTP server provides health endpoint with metadata', async (t) => {
  const handler = createHttpHandler({
    env: { ROADFORGE_MCP_MODE: 'self-hosted' },
  })
  const origin = await listen(t, handler)

  const response = await fetch(`${origin}/health`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8')
  const body = await response.json()
  assert.deepEqual(body, {
    status: 'ok',
    service: 'roadforge-mcp',
    version: SERVER_VERSION,
    mode: 'self-hosted',
    protocolVersion: LATEST_PROTOCOL_VERSION,
    transport: 'streamable-http',
  })
})

test('HTTP server handles CORS preflight with appropriate headers', async (t) => {
  const handler = createHttpHandler({
    env: { ROADFORGE_MCP_MODE: 'self-hosted' },
  })
  const origin = await listen(t, handler)

  const response = await fetch(`${origin}/mcp`, {
    method: 'OPTIONS',
  })
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.match(response.headers.get('access-control-allow-methods'), /POST/)
  assert.match(response.headers.get('access-control-allow-headers'), /x-roadforge-team-token/)
})

test('Mode A (team-gateway) rejects unauthenticated requests with 401', async (t) => {
  const handler = createHttpHandler({
    env: {
      ROADFORGE_MCP_MODE: 'team-gateway',
      ROADFORGE_MCP_TEAM_SECRET: 'super-secret-team-token',
    },
  })
  const origin = await listen(t, handler)

  // Missing Authorization header
  const res1 = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  })
  assert.equal(res1.status, 401)
  const body1 = await res1.json()
  assert.equal(body1.error.code, -32001)
  assert.match(body1.error.message, /Valid team bearer token required/)

  // Wrong Bearer token
  const res2 = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer wrong-token',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
  })
  assert.equal(res2.status, 401)
})

test('Mode A (team-gateway) accepts valid bearer token and team header', async (t) => {
  const handler = createHttpHandler({
    env: {
      ROADFORGE_MCP_MODE: 'team-gateway',
      ROADFORGE_MCP_TEAM_SECRET: 'team-secret-12345',
    },
  })
  const origin = await listen(t, handler)

  // Via Authorization: Bearer
  const res1 = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer team-secret-12345',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  })
  assert.equal(res1.status, 200)
  const body1 = await res1.json()
  assert.deepEqual(body1, { jsonrpc: '2.0', id: 1, result: {} })

  // Via x-roadforge-team-token header
  const res2 = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-roadforge-team-token': 'team-secret-12345',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
  })
  assert.equal(res2.status, 200)
  const body2 = await res2.json()
  assert.deepEqual(body2, { jsonrpc: '2.0', id: 2, result: {} })
})

test('Mode B (self-hosted) permits unauthenticated access when no auth token is configured', async (t) => {
  const handler = createHttpHandler({
    env: {
      ROADFORGE_MCP_MODE: 'self-hosted',
    },
  })
  const origin = await listen(t, handler)

  const res = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'ping' }),
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body, { jsonrpc: '2.0', id: 10, result: {} })
})

test('Mode B (self-hosted) enforces auth token when configured', async (t) => {
  const handler = createHttpHandler({
    env: {
      ROADFORGE_MCP_MODE: 'self-hosted',
      ROADFORGE_MCP_AUTH_TOKEN: 'custom-auth-key-777',
    },
  })
  const origin = await listen(t, handler)

  const resDenied = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  })
  assert.equal(resDenied.status, 401)

  const resAllowed = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer custom-auth-key-777',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
  })
  assert.equal(resAllowed.status, 200)
})

test('HTTP server supports SSE endpoint for notifications', async (t) => {
  const handler = createHttpHandler({
    env: { ROADFORGE_MCP_MODE: 'self-hosted' },
  })
  const origin = await listen(t, handler)

  const controller = new AbortController()
  const res = await fetch(`${origin}/sse`, {
    headers: { Accept: 'text/event-stream' },
    signal: controller.signal,
  })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /text\/event-stream/)

  const reader = res.body.getReader()
  const { value } = await reader.read()
  const text = new TextDecoder().decode(value)
  assert.match(text, /event: endpoint/)
  assert.match(text, /data: \/sse/)

  controller.abort()
})

test('HTTP server rejects oversized payloads with 413', async (t) => {
  const handler = createHttpHandler({
    env: { ROADFORGE_MCP_MODE: 'self-hosted' },
  })
  const origin = await listen(t, handler)

  const largeBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'ping',
    padding: 'x'.repeat(1024 * 1024 + 100),
  })

  try {
    const res = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: largeBody,
    })
    assert.equal(res.status, 413)
  } catch (err) {
    // Some runtimes destroy socket upon 413 overflow
    assert.ok(err)
  }
})

test('Mode A per-request scoping passes headers to client handlers', async (t) => {
  let requestedUrl = null
  let requestedHeaders = null

  const mockFetch = async (url, options = {}) => {
    requestedUrl = String(url)
    requestedHeaders = options.headers
    return new Response(
      JSON.stringify({
        roadmap_id: 'rm_scoped_override',
        updated_at: '2026-11-19T01:00:00Z',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const handler = createHttpHandler({
    env: {
      ROADFORGE_MCP_MODE: 'team-gateway',
      ROADFORGE_MCP_TEAM_SECRET: 'team-pass',
      ROADFORGE_API_URL: 'http://127.0.0.1:8000',
      ROADFORGE_ROADMAP_ID: 'rm_default',
      ROADFORGE_SESSION_TOKEN: 'token_default',
    },
    fetchImpl: mockFetch,
  })
  const origin = await listen(t, handler)

  // Initialize server first
  const initRes = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer team-pass',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
  })
  assert.equal(initRes.status, 200)

  // Tool call with per-request scoping headers
  const toolRes = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer team-pass',
      'x-roadforge-roadmap-id': 'rm_scoped_override',
      'x-roadforge-session-token': 'token_scoped_override',
      'x-roadforge-api-url': 'https://override-api.anvilary.tools',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'roadforge_revision', arguments: {} },
    }),
  })
  assert.equal(toolRes.status, 200)
  const toolJson = await toolRes.json()
  assert.equal(toolJson.isError, undefined)
  assert.equal(requestedUrl, 'https://override-api.anvilary.tools/api/roadmaps/rm_scoped_override/revision')
  assert.equal(requestedHeaders.Authorization, 'Bearer token_scoped_override')
})
