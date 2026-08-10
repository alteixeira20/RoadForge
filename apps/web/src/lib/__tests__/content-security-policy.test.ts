import { describe, expect, it } from 'vitest'

import {
  buildContentSecurityPolicy,
  contentSecurityPolicyHeader,
  resolveApiOrigin,
  resolveContentSecurityPolicyMode,
} from '@/lib/content-security-policy'

describe('content security policy', () => {
  it('enforces a nonce-bound production script policy by default', () => {
    const mode = resolveContentSecurityPolicyMode(true, undefined)
    const header = contentSecurityPolicyHeader(
      {
        isProduction: true,
        apiOrigin: 'https://roadforge.example',
        nonce: 'nonce-value',
      },
      mode,
    )

    expect(mode).toBe('enforce')
    expect(header.key).toBe('Content-Security-Policy')
    expect(header.value).toContain(
      "script-src 'self' 'nonce-nonce-value' 'strict-dynamic'",
    )
    expect(header.value).not.toMatch(/script-src[^;]*'unsafe-inline'/)
    expect(header.value).not.toMatch(/script-src[^;]*'unsafe-eval'/)
    expect(header.value).toContain("connect-src 'self' https://roadforge.example")
    expect(header.value).toContain('upgrade-insecure-requests')
  })

  it('supports an explicit production report-only observation/rollback mode', () => {
    const mode = resolveContentSecurityPolicyMode(true, 'report-only')
    const header = contentSecurityPolicyHeader(
      {
        isProduction: true,
        apiOrigin: null,
        nonce: 'observation-nonce',
      },
      mode,
    )

    expect(header.key).toBe('Content-Security-Policy-Report-Only')
    expect(header.value).toContain("'nonce-observation-nonce'")
  })

  it('fails closed on an unknown production mode', () => {
    expect(resolveContentSecurityPolicyMode(true, 'typo')).toBe('enforce')
    expect(resolveContentSecurityPolicyMode(false, 'typo')).toBe('report-only')
  })

  it('keeps development debugging and local API/realtime origins out of production', () => {
    const policy = buildContentSecurityPolicy({
      isProduction: false,
      apiOrigin: null,
      nonce: 'development-nonce',
    })

    expect(policy).toContain(
      "script-src 'self' 'nonce-development-nonce' 'strict-dynamic' 'unsafe-eval'",
    )
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/)
    expect(policy).toContain('http://localhost:7878')
    expect(policy).toContain('ws://localhost:*')
    expect(policy).not.toContain('upgrade-insecure-requests')
  })

  it('accepts only valid API origins', () => {
    expect(resolveApiOrigin('https://roadforge.example/api')).toBe(
      'https://roadforge.example',
    )
    expect(resolveApiOrigin('not a url')).toBeNull()
    expect(resolveApiOrigin(undefined)).toBeNull()
  })
})
