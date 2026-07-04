'use client'

import { useState } from 'react'
import { revokeParticipant } from '@/services/roadmap-sharing.service'
import type { Participant } from '@/types/roadmap'

interface UseParticipantRevocationParams {
  serverRoadmapId: string | null
  sessionToken: string | null
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>
  setParticipantsError: React.Dispatch<React.SetStateAction<string | null>>
  refreshParticipants: () => Promise<void>
  showToast: (message: string) => void
}

interface UseParticipantRevocationResult {
  pendingRevokeParticipant: Participant | null
  revokeLoading: boolean
  requestRevokeParticipant: (participant: Participant) => Promise<void>
  confirmRevokeParticipant: () => Promise<void>
  cancelRevokeParticipant: () => void
}

export function useParticipantRevocation({
  serverRoadmapId,
  sessionToken,
  setParticipants,
  setParticipantsError,
  refreshParticipants,
  showToast,
}: UseParticipantRevocationParams): UseParticipantRevocationResult {
  const [pendingRevokeParticipant, setPendingRevokeParticipant] = useState<Participant | null>(null)
  const [revokeLoading, setRevokeLoading] = useState(false)

  const requestRevokeParticipant = async (participant: Participant) => {
    if (!serverRoadmapId || !sessionToken) return
    if (participant.isCurrentParticipant) {
      showToast('You cannot revoke your current owner session.')
      return
    }
    setPendingRevokeParticipant(participant)
  }

  const confirmRevokeParticipant = async () => {
    if (!pendingRevokeParticipant || !serverRoadmapId || !sessionToken) return
    const participant = pendingRevokeParticipant
    setRevokeLoading(true)
    try {
      await revokeParticipant(serverRoadmapId, participant.id, sessionToken)
      showToast('Participant revoked')
      setParticipants((current) => current.map((item) => (
        item.id === participant.id
          ? { ...item, revokedAt: new Date().toISOString() }
          : item
      )))
      setParticipantsError(null)
      setPendingRevokeParticipant(null)
      await refreshParticipants()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('401') || msg.includes('403')) showToast('Only the owner can manage participants.')
      else if (msg.includes('400')) showToast('You cannot revoke your current owner session.')
      else showToast('Could not revoke participant')
      setPendingRevokeParticipant(null)
    } finally {
      setRevokeLoading(false)
    }
  }

  const cancelRevokeParticipant = () => {
    setPendingRevokeParticipant(null)
  }

  return {
    pendingRevokeParticipant,
    revokeLoading,
    requestRevokeParticipant,
    confirmRevokeParticipant,
    cancelRevokeParticipant,
  }
}
