import type { Metadata } from 'next'
import { Lexend, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/context/ThemeContext'
import { RoadmapProvider } from '@/context/RoadmapContext'
import { ThemeAwareFavicon } from '@/components/ui/ThemeAwareFavicon'
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
  title: 'Anvilary · Public Beta',
  description:
    'Anvilary is a work-in-progress roadmap planner. Start locally, export portable JSON, and optionally collaborate without creating an account.',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${lexend.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ThemeAwareFavicon />
        <ThemeProvider>
          <RoadmapProvider>{children}</RoadmapProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
