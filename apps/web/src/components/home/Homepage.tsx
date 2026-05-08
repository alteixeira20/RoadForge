'use client'

import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { HeroSection } from './HeroSection'
import { HowItWorksSection } from './HowItWorksSection'
import { FeaturesSection } from './FeaturesSection'

interface HomepageProps {
  onCreate: () => void
}

export function Homepage({ onCreate }: HomepageProps) {
  return (
    <div className="home">
      <SiteHeader onCreate={onCreate} />
      <HeroSection onCreate={onCreate} />
      <HowItWorksSection />
      <FeaturesSection />
      <SiteFooter />
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 40 }}>
        <ThemeToggle />
      </div>
    </div>
  )
}
