'use client'

import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { HeroSection } from './HeroSection'
import { HowItWorksSection } from './HowItWorksSection'
import { WorkspaceProofSection } from './WorkspaceProofSection'
import { FeaturesSection } from './FeaturesSection'
import { ClosingCTA } from './ClosingCTA'

interface HomepageProps {
  onCreate: () => void
}

export function Homepage({ onCreate }: HomepageProps) {
  return (
    <div className="home">
      <SiteHeader onCreate={onCreate} />
      <HeroSection onCreate={onCreate} />
      <HowItWorksSection />
      <WorkspaceProofSection />
      <FeaturesSection />
      <ClosingCTA onCreate={onCreate} />
      <SiteFooter />
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 40 }}>
        <ThemeToggle />
      </div>
    </div>
  )
}
