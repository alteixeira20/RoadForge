import type { NextConfig } from 'next'
import path from 'node:path'

import { contentSecurityPolicyHeader } from './src/lib/content-security-policy'

function getApiOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL
  if (!raw) return 'http://localhost:7878'
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
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
          contentSecurityPolicyHeader({
            isProduction: process.env.NODE_ENV === 'production',
            apiOrigin: getApiOrigin(),
          }),
        ],
      },
    ]
  },
}

export default nextConfig
