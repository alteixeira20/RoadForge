import { createServer } from 'node:http'
import {
  LATEST_PROTOCOL_VERSION,
  SERVER_VERSION,
  createMessageHandler,
} from './server.mjs'

const MAX_BODY_BYTES = 1024 * 1024 // 1 MB

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
    'Access-Control-Allow-Origin': '*',
    ...headers,
  })
  res.end(payload)
}

function sendJsonRpcError(res, statusCode, code, message, id = null) {
  sendJson(res, statusCode, {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  })
}

export function createHttpHandler({
  env = process.env,
  fetchImpl = globalThis.fetch,
  configPath,
  teamSecret,
  authToken,
  mode,
} = {}) {
  const effectiveTeamSecret = teamSecret ?? env.ROADFORGE_MCP_TEAM_SECRET
  const effectiveAuthToken = authToken ?? env.ROADFORGE_MCP_AUTH_TOKEN
  const effectiveMode =
    mode ??
    (effectiveTeamSecret || env.ROADFORGE_MCP_MODE === 'team-gateway'
      ? 'team-gateway'
      : 'self-hosted')

  let isInitialized = false

  // Default handler using static environment/config
  const defaultHandler = createMessageHandler({
    env,
    fetchImpl,
    configPath,
  })

  return async function requestHandler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)
    const pathname = url.pathname

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, x-roadforge-team-token, x-roadforge-token, x-roadforge-roadmap-id, x-roadforge-session-token, x-roadforge-api-url',
        'Access-Control-Max-Age': '86400',
      })
      res.end()
      return
    }

    // Health check endpoint
    if (pathname === '/health' || (pathname === '/' && req.method === 'GET')) {
      sendJson(res, 200, {
        status: 'ok',
        service: 'roadforge-mcp',
        version: SERVER_VERSION,
        mode: effectiveMode,
        protocolVersion: LATEST_PROTOCOL_VERSION,
        transport: 'streamable-http',
      })
      return
    }

    // Only /mcp and /sse routes are supported
    const isMcpPath =
      pathname === '/mcp' || pathname === '/sse' || pathname === '/'
    if (!isMcpPath) {
      sendJsonRpcError(res, 404, -32601, `Not found: ${pathname}`)
      return
    }

    // Authorization verification
    const authHeader = req.headers.authorization
    const bearerToken = parseBearerToken(authHeader)
    const teamHeader = req.headers['x-roadforge-team-token']
    const customAuthHeader = req.headers['x-roadforge-token']

    if (effectiveMode === 'team-gateway') {
      const providedSecret = bearerToken || teamHeader
      if (!effectiveTeamSecret) {
        sendJsonRpcError(
          res,
          500,
          -32603,
          'Server misconfiguration: ROADFORGE_MCP_TEAM_SECRET is not configured for team-gateway mode',
        )
        return
      }
      if (!providedSecret || providedSecret !== effectiveTeamSecret) {
        sendJsonRpcError(
          res,
          401,
          -32001,
          'Unauthorized: Valid team bearer token required for RoadForge team gateway',
        )
        return
      }
    } else if (effectiveMode === 'self-hosted' && effectiveAuthToken) {
      const providedAuth = bearerToken || customAuthHeader
      if (!providedAuth || providedAuth !== effectiveAuthToken) {
        sendJsonRpcError(
          res,
          401,
          -32001,
          'Unauthorized: Valid authentication token required',
        )
        return
      }
    }

    // Server-Sent Events (SSE) stream for notifications
    if (req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
      res.write(': keepalive\n\n')
      res.write(`event: endpoint\ndata: ${pathname === '/' ? '/mcp' : pathname}\n\n`)

      const keepAliveInterval = setInterval(() => {
        res.write(': keepalive\n\n')
      }, 15000)

      req.on('close', () => {
        clearInterval(keepAliveInterval)
      })
      return
    }

    // POST /mcp (JSON-RPC 2.0 messages)
    if (req.method === 'POST') {
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
          sendJsonRpcError(res, 400, -32700, 'Parse error: invalid payload encoding')
          return
        }

        if (!bodyString.trim()) {
          sendJsonRpcError(res, 400, -32600, 'Invalid Request: empty body')
          return
        }

        let parsedMessage
        try {
          parsedMessage = JSON.parse(bodyString)
        } catch {
          sendJsonRpcError(res, 400, -32700, 'Parse error: malformed JSON')
          return
        }

        if (parsedMessage?.method === 'initialize') {
          isInitialized = true
        }

        // Per-request scoped delegation (least privilege)
        const scopedRoadmapId = req.headers['x-roadforge-roadmap-id']
        const scopedSessionToken = req.headers['x-roadforge-session-token']
        const scopedApiUrl = req.headers['x-roadforge-api-url']

        let handlerToUse = defaultHandler
        if (scopedRoadmapId || scopedSessionToken || scopedApiUrl) {
          const scopedEnv = {
            ...env,
            ...(scopedRoadmapId ? { ROADFORGE_ROADMAP_ID: scopedRoadmapId } : {}),
            ...(scopedSessionToken
              ? { ROADFORGE_SESSION_TOKEN: scopedSessionToken }
              : {}),
            ...(scopedApiUrl ? { ROADFORGE_API_URL: scopedApiUrl } : {}),
          }
          handlerToUse = createMessageHandler({
            env: scopedEnv,
            fetchImpl,
            configPath,
            initialInitialized: isInitialized,
          })
        }

        try {
          const result = await handlerToUse(parsedMessage)
          if (!result) {
            // Notifications return 204 No Content
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
            })
            res.end()
            return
          }
          sendJson(res, 200, result)
        } catch (error) {
          sendJsonRpcError(
            res,
            500,
            -32603,
            error?.message || 'Internal error handling request',
            parsedMessage?.id ?? null,
          )
        }
      })

      return
    }

    sendJsonRpcError(res, 405, -32601, `Method not allowed: ${req.method}`)
  }
}

export function startHttpServer(options = {}) {
  const env = options.env ?? process.env
  const port = options.port ?? (env.ROADFORGE_MCP_PORT ? Number(env.ROADFORGE_MCP_PORT) : 8787)
  const host = options.host ?? (env.ROADFORGE_MCP_HOST || '127.0.0.1')
  const handler = createHttpHandler(options)
  const server = createServer(handler)

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, host, () => {
      resolve(server)
    })
  })
}
