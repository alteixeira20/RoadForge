import type { Metadata } from 'next'
import { Lexend, JetBrains_Mono } from 'next/font/google'
import { headers } from 'next/headers'
import { StorageWriteFailureBanner } from '@/components/ui/StorageWriteFailureBanner'
import { RoadmapProvider } from '@/context/RoadmapContext'
import './globals.css'

const lexend = Lexend({
  subsets: ['latin'],
  variable: '--font-lexend',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500'],
  display: 'swap',
})

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
  },
  twitter: {
    card: 'summary',
    title: 'RoadForge',
    description:
      'Local-first roadmap planning with portable exports and optional accountless collaboration.',
  },
  manifest: '/site.webmanifest',
  // Static dark-UI favicons — the white Anvilary mark reads on dark browser chrome.
  icons: {
    icon: [
      { url: '/brand/anvilary-logo-mark-square-32-white.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/anvilary-logo-mark-square-16-white.png', sizes: '16x16', type: 'image/png' },
      { url: '/brand/anvilary-logo-mark-square-48-white.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: [{ url: '/brand/anvilary-logo-mark-square-180.png', sizes: '180x180', type: 'image/png' }],
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce-based CSP requires request-time rendering so Next.js can read the
  // middleware CSP header and attach the per-response nonce to framework and
  // hydration scripts. This intentionally opts document routes out of static
  // HTML caching; middleware also marks those responses private/no-store.
  await headers()

  return (
    <html lang="en" className={`${lexend.variable} ${jetbrainsMono.variable}`}>
      <body>
        <StorageWriteFailureBanner />
        <RoadmapProvider>{children}</RoadmapProvider>
      </body>
    </html>
  )
}
