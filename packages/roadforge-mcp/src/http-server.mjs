import { createServer } from 'node:http'
import crypto from 'node:crypto'
import {
  LATEST_PROTOCOL_VERSION,
  SERVER_VERSION,
  createMessageHandler,
} from './server.mjs'
import {
  isAllowedHost,
  isAllowedOrigin,
  isLoopbackHost,
  verifyTeamJwt,
} from './auth.mjs'

const MAX_BODY_BYTES = 1024 * 1024 // 1 MB
const DEFAULT_REQUEST_TIMEOUT_MS = 30000 // 30 seconds
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes
const MAX_SESSIONS = 1000

function parseBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') return null
  const match = authorizationHeader.trim().match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

function sendJson(res, statusCode, data, headers = {}) {
  const payload = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  })
  res.end(payload)
}

function sendJsonRpcError(res, statusCode, code, message, id = null, headers = {}) {
  sendJson(
    res,
    statusCode,
    {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    },
    headers,
  )
}

export class SessionManager {
  constructor({ sessionTtlMs = DEFAULT_SESSION_TTL_MS, maxSessions = MAX_SESSIONS } = {}) {
    this.sessions = new Map()
    this.sessionTtlMs = sessionTtlMs
    this.maxSessions = maxSessions
    this.sweepInterval = setInterval(() => this.cleanupExpired(), 60000)
    if (this.sweepInterval.unref) this.sweepInterval.unref()
  }

  createSession({
    roadmapId,
    sessionToken,
    env,
    fetchImpl,
    configPath,
    user = null,
  }) {
    this.cleanupExpired()
    if (this.sessions.size >= this.maxSessions) {
      throw Object.assign(new Error('Too many active MCP sessions'), { statusCode: 503 })
    }

    const sessionId = `mcp-sess_${crypto.randomUUID()}`
    const scopedEnv = {
      ...env,
      ...(roadmapId ? { ROADFORGE_ROADMAP_ID: roadmapId } : {}),
      ...(sessionToken ? { ROADFORGE_SESSION_TOKEN: sessionToken } : {}),
    }

    let isInitialized = false
    const baseHandler = createMessageHandler({
      env: scopedEnv,
      fetchImpl,
      configPath,
      initialInitialized: false,
    })

    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastActive: Date.now(),
      user,
      roadmapId,
      sessionToken,
      get isInitialized() {
        return isInitialized
      },
      set isInitialized(val) {
        isInitialized = val
      },
      handler: async (message) => {
        if (message?.method === 'initialize') {
          isInitialized = true
        }
        return baseHandler(message)
      },
      sseRes: null,
      keepAliveTimer: null,
    }

    this.sessions.set(sessionId, session)
    return session
  }

  getSession(sessionId) {
    if (!sessionId) return null
    const session = this.sessions.get(sessionId)
    if (!session) return null
    if (Date.now() - session.lastActive > this.sessionTtlMs) {
      this.destroySession(sessionId)
      return null
    }
    session.lastActive = Date.now()
    return session
  }

  destroySession(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.keepAliveTimer) {
      clearInterval(session.keepAliveTimer)
      session.keepAliveTimer = null
    }
    if (session.sseRes && !session.sseRes.writableEnded) {
      try {
        session.sseRes.end()
      } catch {
        // ignore
      }
    }
    this.sessions.delete(sessionId)
  }

  cleanupExpired() {
    const now = Date.now()
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActive > this.sessionTtlMs) {
        this.destroySession(id)
      }
    }
  }

  closeAll() {
    clearInterval(this.sweepInterval)
    for (const id of Array.from(this.sessions.keys())) {
      this.destroySession(id)
    }
  }
}

export function createHttpHandler({
  env = process.env,
  fetchImpl = globalThis.fetch,
  configPath,
  mode,
  jwtSecret,
  teamSecret,
  authToken,
  revokedTokens = [],
  allowedOrigins,
  allowedHosts,
  host: configuredHost,
  sessionManager,
} = {}) {
  const effectiveJwtSecret =
    jwtSecret ??
    env.ROADFORGE_MCP_JWT_SECRET ??
    teamSecret ??
    env.ROADFORGE_MCP_TEAM_SECRET

  const effectiveAuthToken = authToken ?? env.ROADFORGE_MCP_AUTH_TOKEN
  const effectiveMode =
    mode ??
    env.ROADFORGE_MCP_MODE ??
    (effectiveJwtSecret ? 'team-gateway' : 'self-hosted')

  const effectiveHost =
    configuredHost ?? env.ROADFORGE_MCP_HOST ?? env.HOST ?? '127.0.0.1'
  const hostIsLoopback = isLoopbackHost(effectiveHost)

  // Configure allowed origins
  const parsedAllowedOrigins = (
    allowedOrigins ??
    (env.ROADFORGE_MCP_ALLOWED_ORIGINS
      ? env.ROADFORGE_MCP_ALLOWED_ORIGINS.split(',')
      : [])
  )
    .map((s) => s.trim())
    .filter(Boolean)

  // Configure allowed host headers (DNS rebinding protection)
  const defaultAllowedHosts = [
    '127.0.0.1',
    'localhost',
    '::1',
    '[::1]',
    effectiveHost,
  ]
  const parsedAllowedHosts = (
    allowedHosts ??
    (env.ROADFORGE_MCP_ALLOWED_HOSTS
      ? env.ROADFORGE_MCP_ALLOWED_HOSTS.split(',')
      : defaultAllowedHosts)
  )
    .map((s) => s.trim())
    .filter(Boolean)

  // Revocation list
  const revokedTokensSet = new Set([
    ...revokedTokens,
    ...(env.ROADFORGE_MCP_REVOKED_TOKENS
      ? env.ROADFORGE_MCP_REVOKED_TOKENS.split(',').map((s) => s.trim())
      : []),
  ])

  // Fixed operator-configured API URL for hosted mode
  const operatorApiUrl =
    env.ROADFORGE_API_URL || 'https://roadforge.anvilary.tools'

  const sessions = sessionManager || new SessionManager()

  return async function requestHandler(req, res) {
    // Resource protection: request socket timeout
    req.setTimeout(DEFAULT_REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('Request timeout'))
    })

    // 1. Host header validation & DNS-rebinding protection
    const hostHeader = req.headers.host
    if (!isAllowedHost(hostHeader, parsedAllowedHosts)) {
      sendJsonRpcError(
        res,
        400,
        -32600,
        'Invalid Host header: host is untrusted or invalid (DNS rebinding protection)',
      )
      return
    }

    // 2. HTTP Origin validation & CORS defense
    const originHeader = req.headers.origin
    if (
      originHeader &&
      !isAllowedOrigin(originHeader, parsedAllowedOrigins, hostIsLoopback)
    ) {
      sendJsonRpcError(
        res,
        403,
        -32003,
        'Forbidden: HTTP Origin not allowed by CORS policy',
      )
      return
    }

    const corsHeaders = originHeader
      ? {
          'Access-Control-Allow-Origin': originHeader,
          Vary: 'Origin',
        }
      : {}

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, x-roadforge-roadmap-id, x-roadforge-session-token, mcp-session-id',
        'Access-Control-Max-Age': '86400',
      })
      res.end()
      return
    }

    const url = new URL(req.url, `http://${hostHeader || '127.0.0.1'}`)
    const pathname = url.pathname

    // Health check endpoint
    if (pathname === '/health' || (pathname === '/' && req.method === 'GET')) {
      sendJson(
        res,
        200,
        {
          status: 'ok',
          service: 'roadforge-mcp',
          version: SERVER_VERSION,
          mode: effectiveMode,
          protocolVersion: LATEST_PROTOCOL_VERSION,
          transport: 'streamable-http',
        },
        corsHeaders,
      )
      return
    }

    // Only /mcp and /sse routes are supported
    const isMcpPath =
      pathname === '/mcp' || pathname === '/sse' || pathname === '/'
    if (!isMcpPath) {
      sendJsonRpcError(
        res,
        404,
        -32601,
        `Not found: ${pathname}`,
        null,
        corsHeaders,
      )
      return
    }

    // 3. Security: Prevent caller-controlled upstream API origins in hosted mode
    if (effectiveMode === 'team-gateway' && req.headers['x-roadforge-api-url']) {
      sendJsonRpcError(
        res,
        400,
        -32600,
        'Bad Request: x-roadforge-api-url is prohibited in hosted gateway mode: upstream API URL is operator-configured and immutable',
        null,
        corsHeaders,
      )
      return
    }

    // 4. Team & self-hosted authorization
    const authHeader = req.headers.authorization
    const bearerToken = parseBearerToken(authHeader)
    const customAuthHeader = req.headers['x-roadforge-token']

    let authenticatedUser = null

    if (effectiveMode === 'team-gateway') {
      if (!effectiveJwtSecret) {
        sendJsonRpcError(
          res,
          500,
          -32603,
          'Server misconfiguration: ROADFORGE_MCP_JWT_SECRET is not configured for team-gateway mode',
          null,
          corsHeaders,
        )
        return
      }

      if (!bearerToken) {
        sendJsonRpcError(
          res,
          401,
          -32001,
          'Unauthorized: Valid team bearer token required for RoadForge team gateway',
          null,
          corsHeaders,
        )
        return
      }

      const verifyResult = verifyTeamJwt(bearerToken, {
        secret: effectiveJwtSecret,
        revokedTokens: revokedTokensSet,
      })

      if (!verifyResult.ok) {
        sendJsonRpcError(
          res,
          verifyResult.status || 401,
          -32001,
          verifyResult.error,
          null,
          corsHeaders,
        )
        return
      }

      authenticatedUser = verifyResult.user
    } else if (effectiveMode === 'self-hosted') {
      if (effectiveAuthToken) {
        const providedAuth = bearerToken || customAuthHeader
        if (!providedAuth || providedAuth !== effectiveAuthToken) {
          sendJsonRpcError(
            res,
            401,
            -32001,
            'Unauthorized: Valid authentication token required',
            null,
            corsHeaders,
          )
          return
        }
        authenticatedUser = { sub: 'self-hosted-user' }
      } else if (!hostIsLoopback) {
        // Enforce protection: unauthenticated self-hosted HTTP exposure beyond loopback
        sendJsonRpcError(
          res,
          401,
          -32001,
          'Unauthorized: Authentication token (ROADFORGE_MCP_AUTH_TOKEN) is required when bound beyond loopback',
          null,
          corsHeaders,
        )
        return
      } else {
        authenticatedUser = { sub: 'local-loopback' }
      }
    }

    // 5. Per-request scoped delegation
    const scopedRoadmapId = req.headers['x-roadforge-roadmap-id']
    const scopedSessionToken = req.headers['x-roadforge-session-token']

    // 6. Session lookup / isolation (MCP Streamable HTTP / SSE)
    const sessionIdHeader =
      req.headers['mcp-session-id'] || url.searchParams.get('sessionId')

    let session = sessionIdHeader ? sessions.getSession(sessionIdHeader) : null

    // SSE Stream endpoint for server-to-client notifications
    if (req.method === 'GET') {
      if (!session) {
        try {
          session = sessions.createSession({
            roadmapId: scopedRoadmapId,
            sessionToken: scopedSessionToken,
            env: {
              ...env,
              ROADFORGE_API_URL:
                effectiveMode === 'team-gateway'
                  ? operatorApiUrl
                  : env.ROADFORGE_API_URL || operatorApiUrl,
            },
            fetchImpl,
            configPath,
            user: authenticatedUser,
          })
        } catch (err) {
          sendJsonRpcError(
            res,
            err.statusCode || 500,
            -32603,
            err.message,
            null,
            corsHeaders,
          )
          return
        }
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'mcp-session-id': session.id,
        ...corsHeaders,
      })
      res.write(': keepalive\n\n')
      res.write(`event: endpoint\ndata: /mcp?sessionId=${session.id}\n\n`)

      session.sseRes = res
      session.keepAliveTimer = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': keepalive\n\n')
        }
      }, 15000)

      req.on('close', () => {
        if (session.keepAliveTimer) {
          clearInterval(session.keepAliveTimer)
          session.keepAliveTimer = null
        }
        session.sseRes = null
      })
      return
    }

    // POST /mcp (JSON-RPC 2.0 messages)
    if (req.method === 'POST') {
      // 7. Content-Type enforcement
      const contentType = req.headers['content-type']
      if (!contentType || !contentType.toLowerCase().includes('application/json')) {
        sendJsonRpcError(
          res,
          415,
          -32600,
          'Unsupported Media Type: Content-Type must be application/json',
          null,
          corsHeaders,
        )
        return
      }

      let receivedBytes = 0
      const chunks = []

      req.on('data', (chunk) => {
        receivedBytes += chunk.length
        if (receivedBytes > MAX_BODY_BYTES) {
          req.destroy()
          sendJsonRpcError(
            res,
            413,
            -32600,
            `Payload too large: maximum request body is ${MAX_BODY_BYTES} bytes`,
            null,
            corsHeaders,
          )
          return
        }
        chunks.push(chunk)
      })

      req.on('end', async () => {
        if (receivedBytes > MAX_BODY_BYTES) return

        let bodyString = ''
        try {
          bodyString = Buffer.concat(chunks).toString('utf8')
        } catch {
          sendJsonRpcError(
            res,
            400,
            -32700,
            'Parse error: invalid payload encoding',
            null,
            corsHeaders,
          )
          return
        }

        if (!bodyString.trim()) {
          sendJsonRpcError(
            res,
            400,
            -32600,
            'Invalid Request: empty body',
            null,
            corsHeaders,
          )
          return
        }

        let parsedMessage
        try {
          parsedMessage = JSON.parse(bodyString)
        } catch {
          sendJsonRpcError(
            res,
            400,
            -32700,
            'Parse error: malformed JSON',
            null,
            corsHeaders,
          )
          return
        }

        // Protocol lifecycle & session isolation
        if (parsedMessage?.method === 'initialize') {
          if (!session) {
            try {
              session = sessions.createSession({
                roadmapId: scopedRoadmapId,
                sessionToken: scopedSessionToken,
                env: {
                  ...env,
                  ROADFORGE_API_URL:
                    effectiveMode === 'team-gateway'
                      ? operatorApiUrl
                      : env.ROADFORGE_API_URL || operatorApiUrl,
                },
                fetchImpl,
                configPath,
                user: authenticatedUser,
              })
            } catch (err) {
              sendJsonRpcError(
                res,
                err.statusCode || 500,
                -32603,
                err.message,
                parsedMessage?.id ?? null,
                corsHeaders,
              )
              return
            }
          }
        }

        // Methods other than initialize and ping require an initialized session
        if (parsedMessage?.method !== 'initialize' && parsedMessage?.method !== 'ping') {
          if (!session || !session.isInitialized) {
            sendJsonRpcError(
              res,
              400,
              -32002,
              'Server not initialized: call initialize method first',
              parsedMessage?.id ?? null,
              corsHeaders,
            )
            return
          }
        }

        // If no session exists for ping, create transient handler or use default
        let handlerToUse = session ? session.handler : null
        if (!handlerToUse) {
          handlerToUse = createMessageHandler({
            env: {
              ...env,
              ROADFORGE_API_URL:
                effectiveMode === 'team-gateway'
                  ? operatorApiUrl
                  : env.ROADFORGE_API_URL || operatorApiUrl,
            },
            fetchImpl,
            configPath,
            initialInitialized: false,
          })
        }

        const sessionResponseHeaders = {
          ...corsHeaders,
          ...(session ? { 'mcp-session-id': session.id } : {}),
        }

        try {
          const result = await handlerToUse(parsedMessage)
          if (!result) {
            // Notifications return 204 No Content
            res.writeHead(204, sessionResponseHeaders)
            res.end()
            return
          }
          sendJson(res, 200, result, sessionResponseHeaders)
        } catch (error) {
          sendJsonRpcError(
            res,
            500,
            -32603,
            error?.message || 'Internal error handling request',
            parsedMessage?.id ?? null,
            sessionResponseHeaders,
          )
        }
      })

      return
    }

    sendJsonRpcError(
      res,
      405,
      -32601,
      `Method not allowed: ${req.method}`,
      null,
      corsHeaders,
    )
  }
}

export function startHttpServer(options = {}) {
  const env = options.env ?? process.env
  const port =
    options.port ??
    (env.ROADFORGE_MCP_PORT
      ? Number(env.ROADFORGE_MCP_PORT)
      : env.PORT
      ? Number(env.PORT)
      : 8787)
  const host =
    options.host ?? env.ROADFORGE_MCP_HOST ?? env.HOST ?? '127.0.0.1'
  const mode =
    options.mode ??
    env.ROADFORGE_MCP_MODE ??
    (env.ROADFORGE_MCP_JWT_SECRET || env.ROADFORGE_MCP_TEAM_SECRET
      ? 'team-gateway'
      : 'self-hosted')

  const authToken = options.authToken ?? env.ROADFORGE_MCP_AUTH_TOKEN
  const hostIsLoopback = isLoopbackHost(host)

  // Enforce security check: unauthenticated exposure beyond loopback
  if (mode === 'self-hosted' && !hostIsLoopback && !authToken) {
    throw new Error(
      'Binding self-hosted MCP server beyond loopback without ROADFORGE_MCP_AUTH_TOKEN is forbidden for security.',
    )
  }

  const sessionManager = options.sessionManager ?? new SessionManager()
  const handler = createHttpHandler({
    ...options,
    host,
    port,
    mode,
    sessionManager,
  })
  const server = createServer(handler)
  server.sessionManager = sessionManager

  const originalClose = server.close.bind(server)
  server.close = function closeWithSessions(callback) {
    sessionManager.closeAll()
    return originalClose(callback)
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, host, () => {
      resolve(server)
    })
  })
}
