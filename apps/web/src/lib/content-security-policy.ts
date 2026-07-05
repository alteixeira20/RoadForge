interface ContentSecurityPolicyOptions {
  isProduction: boolean
  apiOrigin: string | null
}

export interface ContentSecurityPolicyHeader {
  key: 'Content-Security-Policy-Report-Only'
  value: string
}

export function buildContentSecurityPolicy({
  isProduction,
  apiOrigin,
}: ContentSecurityPolicyOptions): string {
  const connectSrc = new Set<string>(["'self'"])
  if (apiOrigin) connectSrc.add(apiOrigin)

  if (!isProduction) {
    connectSrc.add('http://localhost:7878')
    connectSrc.add('http://127.0.0.1:7878')
    connectSrc.add('ws://localhost:*')
    connectSrc.add('ws://127.0.0.1:*')
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    isProduction ? "script-src 'self'" : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
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
): ContentSecurityPolicyHeader {
  return {
    key: 'Content-Security-Policy-Report-Only',
    value: buildContentSecurityPolicy(options),
  }
}
