'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Homepage } from '@/components/home/Homepage'
import { CreateWizard } from '@/components/wizard/CreateWizard'

export default function HomePage() {
  const router = useRouter()
  const [showWizard, setShowWizard] = useState(false)

  const handleWizardComplete = () => {
    setShowWizard(false)
    router.push('/workspace')
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
