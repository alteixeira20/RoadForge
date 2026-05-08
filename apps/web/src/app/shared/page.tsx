'use client'

import { useRouter } from 'next/navigation'
import { Workspace } from '@/components/roadmap/Workspace'

export default function SharedPage() {
  const router = useRouter()

  return (
    <Workspace
      mode="viewer"
      onCreateOwn={() => router.push('/')}
    />
  )
}
