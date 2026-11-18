import { Suspense } from 'react'
import { JoinPage } from '@/features/sharing/components/JoinPage'

export default function JoinRoute() {
  return (
    <Suspense>
      <JoinPage />
    </Suspense>
  )
}
