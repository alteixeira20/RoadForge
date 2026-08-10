import { type NextRequest, NextResponse } from 'next/server'

import {
  contentSecurityPolicyHeader,
  resolveApiOrigin,
  resolveContentSecurityPolicyMode,
} from '@/lib/content-security-policy'

function createNonce(): string {
  return btoa(crypto.randomUUID())
}

function isExternallyHttps(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedProto) {
    return forwardedProto
      .split(',')
      .some((value) => value.trim().toLowerCase() === 'https')
  }
  return request.nextUrl.protocol === 'https:'
}

export function middleware(request: NextRequest) {
  const isProduction = process.env.NODE_ENV === 'production'
  const nonce = createNonce()
  const mode = resolveContentSecurityPolicyMode(isProduction)
  const policyHeader = contentSecurityPolicyHeader(
    {
      isProduction,
      apiOrigin: resolveApiOrigin(process.env.NEXT_PUBLIC_API_URL),
      nonce,
      upgradeInsecureRequests: isExternallyHttps(request),
    },
    mode,
  )

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  // Next.js parses the request CSP header during dynamic rendering and applies
  // its nonce to framework/page scripts. This remains an enforcing request
  // header even while the browser-facing response is in report-only mode.
  requestHeaders.set('Content-Security-Policy', policyHeader.value)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })
  response.headers.set(policyHeader.key, policyHeader.value)

  // A nonce is valid for exactly one response. Do not let a reverse proxy/CDN
  // cache HTML carrying a nonce and replay it to later requests.
  response.headers.set('Cache-Control', 'private, no-store')

  return response
}

export const config = {
  matcher: [
    {
      // CSP is a document-response policy. Static assets and API traffic do not
      // need per-request nonces and remain independently cacheable/proxied.
      source: '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
