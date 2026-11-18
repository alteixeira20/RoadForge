import { Suspense } from 'react'
import { JoinPage } from '@/components/join/JoinPage'

export default function JoinRoute() {
  return (
    <Suspense>
      <JoinPage />
    </Suspense>
  )
}
