'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Homepage } from '@/components/home/Homepage'
import { CreateWizard } from '@/components/wizard/CreateWizard'

function HomePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setShowWizard(true)
      router.replace('/')
    }
  }, [router, searchParams])

  const handleWizardComplete = (roadmapId?: string) => {
    setShowWizard(false)
    router.push(roadmapId ? `/workspace?roadmap=${encodeURIComponent(roadmapId)}` : '/workspace')
  }

  return (
    <>
      <Homepage onCreate={() => setShowWizard(true)} />
      {showWizard && (
        <CreateWizard
          onComplete={handleWizardComplete}
          onClose={() => setShowWizard(false)}
        />
      )}
    </>
  )
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageContent />
    </Suspense>
  )
}
