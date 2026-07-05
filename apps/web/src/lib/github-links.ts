import type {
  TaskExternalLink,
  TaskExternalLinkKind,
} from '@/types/roadmap'

export type ExternalLinkParseErrorCode =
  | 'empty'
  | 'invalid_url'
  | 'unsupported_scheme'
  | 'credentials_not_allowed'
  | 'credential_query_not_allowed'
  | 'invalid_id'
  | 'invalid_label'
  | 'malformed_github_url'

export type ExternalLinkParseResult =
  | { ok: true; link: TaskExternalLink }
  | {
    ok: false
    error: {
      code: ExternalLinkParseErrorCode
      message: string
    }
  }

const GITHUB_HOST = 'github.com'
const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const GITHUB_REPO_RE = /^[A-Za-z0-9_.-]{1,100}$/
const COMMIT_SHA_RE = /^[0-9a-fA-F]{7,64}$/
const LINK_ID_MAX = 80
const LINK_LABEL_MAX = 160
const RELEASE_TAG_MAX = 255
const CREDENTIAL_QUERY_KEYS = new Set([
  'access_token',
  'api_key',
  'apikey',
  'auth',
  'authorization',
  'authorization_code',
  'code',
  'client_secret',
  'credential',
  'credentials',
  'key',
  'oauth_code',
  'password',
  'passwd',
  'private_key',
  'refresh_token',
  'secret',
  'token',
])
const CREDENTIAL_VALUE_RE = /^(?:bearer\s+|gh[pousr]_|github_pat_)/i

function failure(
  code: ExternalLinkParseErrorCode,
  message: string,
): ExternalLinkParseResult {
  return { ok: false, error: { code, message } }
}

export function isCredentialLikeFieldName(name: string): boolean {
  const normalized = name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    .toLowerCase()
  return CREDENTIAL_QUERY_KEYS.has(normalized)
    || /(?:^|_)(?:access|api|auth|client|private|refresh)_(?:key|secret|token)$/.test(normalized)
}

function hasCredentialLikeQuery(url: URL): boolean {
  for (const [key, value] of url.searchParams) {
    if (isCredentialLikeFieldName(key) || CREDENTIAL_VALUE_RE.test(value.trim())) {
      return true
    }
  }
  return false
}

function canonicalUrl(url: URL, pathname: string): string {
  const canonical = new URL(url.origin)
  canonical.pathname = pathname
  return canonical.toString().replace(/\/$/, '')
}

function decodeSegment(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function parsePositiveNumber(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

function githubFailure(): ExternalLinkParseResult {
  return failure(
    'malformed_github_url',
    'Use a GitHub issue, pull request, discussion, commit, or release URL.',
  )
}

function githubLink(
  url: URL,
  id: string,
  label: string | undefined,
): ExternalLinkParseResult | null {
  if (url.hostname.toLowerCase() !== GITHUB_HOST) return null
  if (url.protocol !== 'https:' || (url.port && url.port !== '443')) {
    return githubFailure()
  }

  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 3) return null
  const owner = decodeSegment(parts[0])
  const repo = decodeSegment(parts[1])
  if (!owner || !repo || !GITHUB_OWNER_RE.test(owner) || !GITHUB_REPO_RE.test(repo)) {
    return githubFailure()
  }

  const route = parts[2]
  const base = { id, provider: 'github' as const, owner, repo, ...(label ? { label } : {}) }
  if (route === 'issues' || route === 'pull' || route === 'discussions') {
    if (parts.length !== 4) return githubFailure()
    const number = parsePositiveNumber(parts[3])
    if (number === null) return githubFailure()
    const kind = (
      route === 'issues' ? 'issue' : route === 'pull' ? 'pull' : 'discussion'
    ) satisfies TaskExternalLinkKind
    return {
      ok: true,
      link: {
        ...base,
        kind,
        number,
        url: canonicalUrl(url, `/${owner}/${repo}/${route}/${number}`),
      },
    }
  }

  if (route === 'commit') {
    if (parts.length !== 4 || !COMMIT_SHA_RE.test(parts[3])) return githubFailure()
    const sha = parts[3].toLowerCase()
    return {
      ok: true,
      link: {
        ...base,
        kind: 'commit',
        sha,
        url: canonicalUrl(url, `/${owner}/${repo}/commit/${sha}`),
      },
    }
  }

  if (route === 'releases' && parts[3] === 'tag') {
    const encodedTag = parts.slice(4).join('/')
    const tag = decodeSegment(encodedTag)
    if (!tag?.trim() || tag.length > RELEASE_TAG_MAX) return githubFailure()
    return {
      ok: true,
      link: {
        ...base,
        kind: 'release',
        tag,
        url: canonicalUrl(url, `/${owner}/${repo}/releases/tag/${encodedTag}`),
      },
    }
  }

  if (['issues', 'pull', 'discussions', 'commit', 'releases'].includes(route)) {
    return githubFailure()
  }
  return null
}

export function parseTaskExternalLinkUrl(
  input: string,
  id: string,
  label?: string,
): ExternalLinkParseResult {
  const cleanId = id.trim()
  if (!cleanId || cleanId.length > LINK_ID_MAX) {
    return failure('invalid_id', `Link id must be 1–${LINK_ID_MAX} characters.`)
  }
  const cleanLabel = label?.trim() || undefined
  if (cleanLabel && cleanLabel.length > LINK_LABEL_MAX) {
    return failure('invalid_label', `Link label must not exceed ${LINK_LABEL_MAX} characters.`)
  }
  if (!input.trim()) return failure('empty', 'Enter a link URL.')

  let parsed: URL
  try {
    parsed = new URL(input.trim())
  } catch {
    return failure('invalid_url', 'Enter a valid URL.')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return failure('unsupported_scheme', 'Only HTTP and HTTPS links are supported.')
  }
  if (parsed.username || parsed.password) {
    return failure('credentials_not_allowed', 'Links must not include a username or password.')
  }
  if (hasCredentialLikeQuery(parsed)) {
    return failure(
      'credential_query_not_allowed',
      'Remove credential or token parameters from the URL.',
    )
  }

  const github = githubLink(parsed, cleanId, cleanLabel)
  if (github) return github

  const pathname = parsed.pathname.replace(/\/+$/, '') || '/'
  return {
    ok: true,
    link: {
      id: cleanId,
      provider: 'url',
      kind: 'url',
      url: canonicalUrl(parsed, pathname),
      ...(cleanLabel ? { label: cleanLabel } : {}),
    },
  }
}
