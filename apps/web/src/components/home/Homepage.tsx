'use client'

import { EmberBackground } from '@/components/ui/EmberBackground'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { HeroSection } from './HeroSection'
import { HowItWorksSection } from './HowItWorksSection'
import { FeaturesSection } from './FeaturesSection'
import { ClosingCTA } from './ClosingCTA'

interface HomepageProps {
  onCreate: () => void
}

export function Homepage({ onCreate }: HomepageProps) {
  return (
    <div className="home">
      <EmberBackground />
      <SiteHeader onCreate={onCreate} />
      <HeroSection onCreate={onCreate} />
      <HowItWorksSection />
      <FeaturesSection />
      <ClosingCTA onCreate={onCreate} />
      <SiteFooter />
    </div>
  )
}
