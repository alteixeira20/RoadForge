import type { Metadata } from 'next'
import { Lexend, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/context/ThemeContext'
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
  title: 'Roadforge — Open-source roadmap planning',
  description:
    'Plan in phases. Forge your roadmap locally — no account, no sign-up. Self-hostable, AI-friendly.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${lexend.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ThemeProvider>
          <RoadmapProvider>{children}</RoadmapProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
