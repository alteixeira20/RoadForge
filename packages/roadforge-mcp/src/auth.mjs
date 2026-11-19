import crypto from 'node:crypto'

export function base64UrlEncode(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
  return buf.toString('base64url')
}

export function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8')
}

export function isLoopbackHost(host) {
  if (!host || typeof host !== 'string') return false
  const clean = host.split(':')[0].toLowerCase().trim()
  return (
    clean === '127.0.0.1' ||
    clean === 'localhost' ||
    clean === '::1' ||
    clean === '[::1]' ||
    clean.startsWith('127.')
  )
}

export function isAllowedHost(hostHeader, allowedHosts = []) {
  if (!hostHeader || typeof hostHeader !== 'string') return false
  const clean = hostHeader.split(':')[0].toLowerCase().trim()
  if (!clean) return false

  const allowedSet = new Set(
    allowedHosts.map((h) => h.split(':')[0].toLowerCase().trim()),
  )
  return allowedSet.has(clean)
}

export function isAllowedOrigin(originHeader, allowedOrigins = [], hostIsLoopback = false) {
  if (!originHeader || typeof originHeader !== 'string') {
    // Non-browser MCP clients (stdio, backend services) omit Origin; allowed
    return true
  }

  const cleanOrigin = originHeader.trim().toLowerCase()
  if (!cleanOrigin || cleanOrigin === 'null') return false

  const allowedSet = new Set(
    allowedOrigins.map((o) => o.trim().toLowerCase()).filter(Boolean),
  )

  if (allowedSet.has(cleanOrigin)) return true

  // In loopback environments without explicit allowedOrigins, allow loopback origins
  if (hostIsLoopback && allowedSet.size === 0) {
    try {
      const parsed = new URL(cleanOrigin)
      const hostname = parsed.hostname.toLowerCase()
      if (
        hostname === '127.0.0.1' ||
        hostname === 'localhost' ||
        hostname === '::1' ||
        hostname.startsWith('127.')
      ) {
        return true
      }
    } catch {
      return false
    }
  }

  return false
}

export function createTeamJwt({
  sub = 'usr_team_member',
  email = 'member@anvilary.tools',
  team = 'anvilary-core',
  roles = ['team-member'],
  aud = 'roadforge-mcp',
  iss = 'https://auth.anvilary.tools',
  exp = Math.floor(Date.now() / 1000) + 3600,
  nbf = Math.floor(Date.now() / 1000) - 10,
  jti = crypto.randomUUID(),
  secret,
}) {
  if (!secret) throw new Error('JWT secret is required')
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = { sub, email, team, roles, aud, iss, exp, nbf, jti }
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url')
  return `${encodedHeader}.${encodedPayload}.${signature}`
}

export function verifyTeamJwt(
  token,
  { secret, revokedTokens = new Set(), expectedAud = 'roadforge-mcp' } = {},
) {
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, error: 'Unauthorized: Missing or invalid token' }
  }

  const parts = token.trim().split('.')
  if (parts.length !== 3) {
    return { ok: false, error: 'Unauthorized: Malformed JWT token format' }
  }

  const [encodedHeader, encodedPayload, signature] = parts
  let header, payload
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader))
    payload = JSON.parse(base64UrlDecode(encodedPayload))
  } catch {
    return { ok: false, error: 'Unauthorized: Invalid token encoding' }
  }

  if (header?.alg !== 'HS256') {
    return {
      ok: false,
      error: `Unauthorized: Unsupported token algorithm (${header?.alg})`,
    }
  }

  if (!secret) {
    return {
      ok: false,
      error:
        'Server misconfiguration: ROADFORGE_MCP_JWT_SECRET is not configured',
      status: 500,
    }
  }

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url')

  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expectedSig)
  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    return { ok: false, error: 'Unauthorized: Invalid token signature' }
  }

  const nowSec = Math.floor(Date.now() / 1000)
  if (typeof payload.exp === 'number' && payload.exp < nowSec) {
    return { ok: false, error: 'Unauthorized: Token has expired' }
  }

  if (typeof payload.nbf === 'number' && payload.nbf > nowSec) {
    return { ok: false, error: 'Unauthorized: Token is not active yet' }
  }

  if (
    expectedAud &&
    payload.aud &&
    payload.aud !== expectedAud &&
    payload.aud !== 'roadforge'
  ) {
    return { ok: false, error: 'Unauthorized: Token audience mismatch' }
  }

  if (!payload.sub && !payload.email) {
    return {
      ok: false,
      error: 'Unauthorized: Token missing verifiable user identity',
    }
  }

  const hasTeamRole =
    Boolean(payload.team) ||
    (Array.isArray(payload.roles) && payload.roles.includes('team-member')) ||
    payload.team_member === true
  if (!hasTeamRole) {
    return {
      ok: false,
      error: 'Unauthorized: Token lacks required team membership',
    }
  }

  if (payload.jti && revokedTokens.has(payload.jti)) {
    return { ok: false, error: 'Unauthorized: Token has been revoked' }
  }

  if (payload.sub && revokedTokens.has(payload.sub)) {
    return {
      ok: false,
      error: 'Unauthorized: User authorization has been revoked',
    }
  }

  return { ok: true, user: payload }
}
