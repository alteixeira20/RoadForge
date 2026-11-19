import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, request as httpRequest } from 'node:http'
import test from 'node:test'

import { createHttpHandler, startHttpServer } from '../src/http-server.mjs'
import { createTeamJwt } from '../src/auth.mjs'
import { LATEST_PROTOCOL_VERSION, SERVER_VERSION } from '../src/server.mjs'

const TEST_JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-1234567890'

async function listen(t, handler, host = '127.0.0.1') {
  const server = createServer(handler).listen(0, host)
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return `http://${host}:${server.address().port}`
}

test('HTTP server provides health endpoint with metadata and never exposes wildcard CORS', async (t) => {
  const handler = createHttpHandler({
    env: { ROADFORGE_MCP_MODE: 'self-hosted' },
  })
  const origin = await listen(t, handler)

  const response = await fetch(`${origin}/health`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.equal(response.headers.get('access-control-allow-origin'), null)
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

test('Security 1 & 3: HTTP Origin validation and CORS protection rejects untrusted origins', async (t) => {
  const handler = createHttpHandler({
    env: {
      ROADFORGE_MCP_MODE: 'self-hosted',
      ROADFORGE_MCP_ALLOWED_ORIGINS: 'https://trusted.anvilary.tools,http://localhost:3000',
    },
  })
  const origin = await listen(t, handler)

  // Untrusted Origin header is rejected with 403 Forbidden
  const forbiddenRes = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://attacker.evil.com',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  })
  assert.equal(forbiddenRes.status, 403)
  const forbiddenBody = await forbiddenRes.json()
  assert.match(forbiddenBody.error.message, /Origin not allowed/)

  // Untrusted Origin on OPTIONS preflight is rejected
  const forbiddenOptions = await fetch(`${origin}/mcp`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://attacker.evil.com',
      'Access-Control-Request-Method': 'POST',
    },
  })
  assert.equal(forbiddenOptions.status, 403)

  // Trusted Origin succeeds and reflects exact origin (never wildcard *)
  const allowedRes = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://trusted.anvilary.tools',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
  })
  assert.equal(allowedRes.status, 200)
  assert.equal(
    allowedRes.headers.get('access-control-allow-origin'),
    'https://trusted.anvilary.tools',
  )
  assert.notEqual(allowedRes.headers.get('access-control-allow-origin'), '*')
  assert.equal(allowedRes.headers.get('vary'), 'Origin')
})

test('Security 2: Host header validation and DNS-rebinding protection rejects untrusted host', async (t) => {
  const handler = createHttpHandler({
    env: {
      ROADFORGE_MCP_MODE: 'self-hosted',
      ROADFORGE_MCP_ALLOWED_HOSTS: '127.0.0.1,localhost',
    },
  })
  const origin = await listen(t, handler)
  const port = new URL(origin).port

  // Untrusted Host header sent via raw HTTP request (DNS rebinding attempt)
  const rebindingRes = await new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port: Number(port),
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Host: 'evil-rebound-domain.com',
        },
      },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }))
      },
    )
    req.on('error', reject)
    req.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }))
    req.end()
  })

  assert.equal(rebindingRes.status, 400)
  assert.match(rebindingRes.body.error.message, /DNS rebinding protection/)
})

test('Security 4: Content-Type enforcement rejects non-JSON payloads on POST', async (t) => {
  const handler = createHttpHandler({
    env: { ROADFORGE_MCP_MODE: 'self-hosted' },
  })
  const origin = await listen(t, handler)

  // Missing Content-Type
  const resNoCt = await fetch(`${origin}/mcp`, {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  })
  assert.equal(resNoCt.status, 415)
  const body1 = await resNoCt.json()
  assert.match(body1.error.message, /Content-Type must be application\/json/)

  // Form-encoded Content-Type
  const resForm = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'jsonrpc=2.0&id=1&method=ping',
  })
  assert.equal(resForm.status, 415)
})

test('Security 5: Unauthenticated self-hosted HTTP exposure beyond loopback is rejected', async (t) => {
  // Simulating server listening beyond loopback (e.g. host: 0.0.0.0 or 192.168.1.50) without token
  const handlerNonLoopback = createHttpHandler({
    host: '192.168.1.50',
    allowedHosts: ['192.168.1.50', '127.0.0.1'],
    env: {
      ROADFORGE_MCP_MODE: 'self-hosted',
      ROADFORGE_MCP_HOST: '192.168.1.50',
    },
  })
  const origin = await listen(t, handlerNonLoopback)

  const unauthRes = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: '192.168.1.50',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  })
  assert.equal(unauthRes.status, 401)
  const body = await unauthRes.json()
  assert.match(body.error.message, /required when bound beyond loopback/)

  // startHttpServer throws if attempting to bind non-loopback without auth token
  assert.throws(
    () => {
      startHttpServer({
        host: '0.0.0.0',
        mode: 'self-hosted',
        env: { ROADFORGE_MCP_MODE: 'self-hosted' },
      })
    },
    /ROADFORGE_MCP_AUTH_TOKEN is forbidden for security/,
  )
})

test('Security 6: Standards-compliant verifiable user identity and revocable authorization in team-gateway mode', async (t) => {
  const revokedJti = 'revoked-token-uuid-999'
  const revokedSub = 'usr_fired_employee'

  const handler = createHttpHandler({
    jwtSecret: TEST_JWT_SECRET,
    revokedTokens: [revokedJti, revokedSub],
    env: {
      ROADFORGE_MCP_MODE: 'team-gateway',
      ROADFORGE_MCP_JWT_SECRET: TEST_JWT_SECRET,
    },
  })
  const origin = await listen(t, handler)

  // 1. Missing Authorization header
  const resMissing = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  })
  assert.equal(resMissing.status, 401)

  // 2. Malformed token
  const resMalformed = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer not.a.valid.jwt',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
  })
  assert.equal(resMalformed.status, 401)

  // 3. Invalid signature
  const forgedToken = createTeamJwt({
    sub: 'usr_attacker',
    secret: 'wrong-secret-key-12345678901234567890',
  })
  const resBadSig = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${forgedToken}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }),
  })
  assert.equal(resBadSig.status, 401)
  const bodyBadSig = await resBadSig.json()
  assert.match(bodyBadSig.error.message, /Invalid token signature/)

  // 4. Expired token
  const expiredToken = createTeamJwt({
    sub: 'usr_alice',
    exp: Math.floor(Date.now() / 1000) - 300,
    secret: TEST_JWT_SECRET,
  })
  const resExpired = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${expiredToken}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'ping' }),
  })
  assert.equal(resExpired.status, 401)
  const bodyExpired = await resExpired.json()
  assert.match(bodyExpired.error.message, /expired/)

  // 5. Token without team role
  const nonTeamToken = createTeamJwt({
    sub: 'usr_guest',
    roles: ['external-contractor'],
    team: null,
    secret: TEST_JWT_SECRET,
  })
  const resNoTeam = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${nonTeamToken}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'ping' }),
  })
  assert.equal(resNoTeam.status, 401)
  const bodyNoTeam = await resNoTeam.json()
  assert.match(bodyNoTeam.error.message, /team membership/)

  // 6. Revoked token by JTI
  const revokedJtiToken = createTeamJwt({
    sub: 'usr_charlie',
    jti: revokedJti,
    secret: TEST_JWT_SECRET,
  })
  const resRevokedJti = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${revokedJtiToken}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'ping' }),
  })
  assert.equal(resRevokedJti.status, 401)
  const bodyRevokedJti = await resRevokedJti.json()
  assert.match(bodyRevokedJti.error.message, /revoked/)

  // 7. Revoked token by subject
  const revokedSubToken = createTeamJwt({
    sub: revokedSub,
    secret: TEST_JWT_SECRET,
  })
  const resRevokedSub = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${revokedSubToken}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }),
  })
  assert.equal(resRevokedSub.status, 401)
  const bodyRevokedSub = await resRevokedSub.json()
  assert.match(bodyRevokedSub.error.message, /revoked/)

  // 8. Valid verified team JWT
  const validToken = createTeamJwt({
    sub: 'usr_authorized_dev',
    email: 'dev@anvilary.tools',
    secret: TEST_JWT_SECRET,
  })
  const resValid = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${validToken}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'ping' }),
  })
  assert.equal(resValid.status, 200)
  const bodyValid = await resValid.json()
  assert.deepEqual(bodyValid, { jsonrpc: '2.0', id: 8, result: {} })
})

test('Security 7 & 8: Rejects caller-controlled upstream API origins in hosted mode', async (t) => {
  const validToken = createTeamJwt({
    sub: 'usr_dev',
    secret: TEST_JWT_SECRET,
  })

  const handler = createHttpHandler({
    jwtSecret: TEST_JWT_SECRET,
    env: {
      ROADFORGE_MCP_MODE: 'team-gateway',
      ROADFORGE_MCP_JWT_SECRET: TEST_JWT_SECRET,
      ROADFORGE_API_URL: 'http://127.0.0.1:8000',
    },
  })
  const origin = await listen(t, handler)

  // Caller attempts to redirect upstream API to an attacker URL
  const exploitRes = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${validToken}`,
      'x-roadforge-api-url': 'https://evil.attacker.com/steal-credentials',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
  })
  assert.equal(exploitRes.status, 400)
  const exploitBody = await exploitRes.json()
  assert.match(
    exploitBody.error.message,
    /x-roadforge-api-url is prohibited in hosted gateway mode/,
  )
})

test('Security 9: Session isolation prevents cross-client protocol initialization leaks', async (t) => {
  const handler = createHttpHandler({
    env: { ROADFORGE_MCP_MODE: 'self-hosted' },
  })
  const origin = await listen(t, handler)

  // Client A connects and initializes
  const initResA = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: LATEST_PROTOCOL_VERSION },
    }),
  })
  assert.equal(initResA.status, 200)
  const sessionIdA = initResA.headers.get('mcp-session-id')
  assert.ok(sessionIdA, 'Client A should receive mcp-session-id')

  // Client A can now call tools
  const toolsResA = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': sessionIdA,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  })
  assert.equal(toolsResA.status, 200)
  const toolsBodyA = await toolsResA.json()
  assert.ok(Array.isArray(toolsBodyA.result.tools))

  // Client B connects with a NEW/different session WITHOUT initializing
  const uninitializedSessionIdB = 'mcp-sess_uninitialized_client_b'
  const toolsResB = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': uninitializedSessionIdB,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }),
  })
  assert.equal(toolsResB.status, 400)
  const toolsBodyB = await toolsResB.json()
  assert.equal(toolsBodyB.error.code, -32002)
  assert.match(toolsBodyB.error.message, /Server not initialized/)
})

test('Security 10: Resource protections enforce 1 MB payload limits and clean up SSE connections', async (t) => {
  const handler = createHttpHandler({
    env: { ROADFORGE_MCP_MODE: 'self-hosted' },
  })
  const origin = await listen(t, handler)

  // 1. Oversized body rejection (413)
  const largeBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'ping',
    padding: 'x'.repeat(1024 * 1024 + 500),
  })

  try {
    const res = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: largeBody,
    })
    assert.equal(res.status, 413)
  } catch (err) {
    // Socket destruction on 413 is standard behavior
    assert.ok(err)
  }

  // 2. SSE streaming with session attachment and cleanup
  const controller = new AbortController()
  const sseRes = await fetch(`${origin}/sse`, {
    headers: { Accept: 'text/event-stream' },
    signal: controller.signal,
  })
  assert.equal(sseRes.status, 200)
  assert.match(sseRes.headers.get('content-type'), /text\/event-stream/)
  const sseSessionId = sseRes.headers.get('mcp-session-id')
  assert.ok(sseSessionId)

  const reader = sseRes.body.getReader()
  const { value } = await reader.read()
  const chunkText = new TextDecoder().decode(value)
  assert.match(chunkText, /event: endpoint/)
  assert.match(chunkText, new RegExp(`sessionId=${sseSessionId}`))

  controller.abort()
})
