import type { NextConfig } from 'next'
import path from 'node:path'

function getApiOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL
  if (!raw) return 'http://localhost:7878'
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

function buildCspReportOnly(): string {
  const isProd = process.env.NODE_ENV === 'production'
  const connectSrc = new Set<string>(["'self'"])
  const apiOrigin = getApiOrigin()
  if (apiOrigin) connectSrc.add(apiOrigin)

  if (!isProd) {
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
    isProd ? "script-src 'self'" : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    isProd ? "img-src 'self' data: blob:" : "img-src 'self' data: blob:",
    isProd ? "font-src 'self'" : "font-src 'self' data:",
    `connect-src ${Array.from(connectSrc).join(' ')}`,
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ]
  if (isProd) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: buildCspReportOnly(),
          },
        ],
      },
    ]
  },
}

export default nextConfig
