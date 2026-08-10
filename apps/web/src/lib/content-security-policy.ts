export type ContentSecurityPolicyMode = 'enforce' | 'report-only'

interface ContentSecurityPolicyOptions {
  isProduction: boolean
  apiOrigin: string | null
  nonce: string
}

export interface ContentSecurityPolicyHeader {
  key: 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only'
  value: string
}

const CSP_MODE_ENV = 'ROADFORGE_CSP_MODE'

export function resolveApiOrigin(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

export function resolveContentSecurityPolicyMode(
  isProduction: boolean,
  rawMode = process.env[CSP_MODE_ENV],
): ContentSecurityPolicyMode {
  if (rawMode === 'report-only' || rawMode === 'enforce') return rawMode

  // Production fails closed: an unset or mistyped mode must not silently
  // weaken script protection. Development stays report-only so HMR/debugging
  // failures remain visible without stranding the local developer session.
  return isProduction ? 'enforce' : 'report-only'
}

export function buildContentSecurityPolicy({
  isProduction,
  apiOrigin,
  nonce,
}: ContentSecurityPolicyOptions): string {
  const connectSrc = new Set<string>(["'self'"])
  if (apiOrigin) connectSrc.add(apiOrigin)

  if (!isProduction) {
    connectSrc.add('http://localhost:7878')
    connectSrc.add('http://127.0.0.1:7878')
    connectSrc.add('ws://localhost:*')
    connectSrc.add('ws://127.0.0.1:*')
  }

  const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]
  if (!isProduction) scriptSources.push("'unsafe-eval'")

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(' ')}`,
    // RoadForge currently uses React style attributes for dynamic colors,
    // positioning, and interaction state. Script execution is nonce-bound in
    // this release; removing inline CSS is a separate compatibility project.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    isProduction ? "font-src 'self'" : "font-src 'self' data:",
    `connect-src ${Array.from(connectSrc).join(' ')}`,
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ]
  if (isProduction) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

export function contentSecurityPolicyHeader(
  options: ContentSecurityPolicyOptions,
  mode: ContentSecurityPolicyMode,
): ContentSecurityPolicyHeader {
  return {
    key: mode === 'enforce'
      ? 'Content-Security-Policy'
      : 'Content-Security-Policy-Report-Only',
    value: buildContentSecurityPolicy(options),
  }
}
