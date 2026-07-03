'use client'

import { useState, useEffect } from 'react'
import { getParticipants } from '@/services/roadmap-sharing.service'
import type { Participant } from '@/types/roadmap'

interface UseWorkspaceParticipantsParams {
  serverRoadmapId: string | null
  sessionToken: string | null
  role: string | null
}

interface UseWorkspaceParticipantsResult {
  participants: Participant[]
  participantsLoading: boolean
  participantsError: string | null
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>
  setParticipantsError: React.Dispatch<React.SetStateAction<string | null>>
  refreshParticipants: () => Promise<void>
}

export function useWorkspaceParticipants({
  serverRoadmapId,
  sessionToken,
  role,
}: UseWorkspaceParticipantsParams): UseWorkspaceParticipantsResult {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [participantsError, setParticipantsError] = useState<string | null>(null)

  useEffect(() => {
    setParticipants([])
    setParticipantsError(null)
    if (!serverRoadmapId || !sessionToken || (role !== 'owner' && role !== 'editor')) {
      setParticipantsLoading(false)
      return
    }
    let cancelled = false
    setParticipantsLoading(true)
    getParticipants(serverRoadmapId, sessionToken)
      .then((data) => {
        if (!cancelled) setParticipants(data)
      })
      .catch(() => {
        if (!cancelled) {
          setParticipants([])
          setParticipantsError('Could not load team members.')
        }
      })
      .finally(() => {
        if (!cancelled) setParticipantsLoading(false)
      })
    return () => { cancelled = true }
  }, [serverRoadmapId, sessionToken, role])

  const refreshParticipants = async () => {
    if (!serverRoadmapId || !sessionToken) return
    try {
      setParticipants(await getParticipants(serverRoadmapId, sessionToken))
    } catch {
      setParticipantsError('Could not refresh team members.')
    }
  }

  return {
    participants,
    participantsLoading,
    participantsError,
    setParticipants,
    setParticipantsError,
    refreshParticipants,
  }
}
