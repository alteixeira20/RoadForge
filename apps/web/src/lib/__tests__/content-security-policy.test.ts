import { describe, expect, it } from 'vitest'

import {
  buildContentSecurityPolicy,
  contentSecurityPolicyHeader,
} from '@/lib/content-security-policy'

describe('content security policy', () => {
  it('keeps the production policy report-only pending browser evidence', () => {
    const header = contentSecurityPolicyHeader({
      isProduction: true,
      apiOrigin: 'https://roadforge.example',
    })

    expect(header.key).toBe('Content-Security-Policy-Report-Only')
    expect(header.value).toContain("script-src 'self'")
    expect(header.value).toContain("connect-src 'self' https://roadforge.example")
    expect(header.value).toContain('upgrade-insecure-requests')
  })

  it('allows the local origins and runtime script requirements only in development', () => {
    const policy = buildContentSecurityPolicy({
      isProduction: false,
      apiOrigin: null,
    })

    expect(policy).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'")
    expect(policy).toContain('http://localhost:7878')
    expect(policy).toContain('ws://localhost:*')
    expect(policy).not.toContain('upgrade-insecure-requests')
  })
})
