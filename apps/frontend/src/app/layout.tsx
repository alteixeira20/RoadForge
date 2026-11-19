import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { StorageWriteFailureBanner } from '@/shared/ui/StorageWriteFailureBanner'
import { RoadmapProvider } from '@/features/synchronization/components/RoadmapProvider'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://roadforge.anvilary.tools'),
  title: 'RoadForge',
  description:
    'RoadForge by Anvilary is a local-first roadmap planner with portable exports and optional accountless collaboration.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'RoadForge',
    title: 'RoadForge',
    description:
      'Local-first roadmap planning with portable exports and optional accountless collaboration.',
    images: [
      {
        url: '/brand/roadforge/social-preview.png',
        width: 1200,
        height: 630,
        alt: 'RoadForge',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RoadForge',
    description:
      'Local-first roadmap planning with portable exports and optional accountless collaboration.',
    images: ['/brand/roadforge/social-preview.png'],
  },
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce-based CSP requires request-time rendering so Next.js can read the
  // middleware CSP header and attach the per-response nonce to framework and
  // hydration scripts. This intentionally opts document routes out of static
  // HTML caching; middleware also marks those responses private/no-store.
  await headers()

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <StorageWriteFailureBanner />
        <RoadmapProvider>{children}</RoadmapProvider>
      </body>
    </html>
  )
}
