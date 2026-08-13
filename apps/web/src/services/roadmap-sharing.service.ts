// ─── Sharing service ────────────────────────────────────────────────────────────
// Join roadmap via invite, share-link management, and participant management.

import type { ShareLink, ShareRole, Participant } from '@/types/roadmap'
import { requestJson, resolveBrowserSessionToken } from './roadmap-http'

interface ApiShareLinkResponse {
  id: string | null
  role: string
  token_prefix: string | null
  url: string | null
  is_active: boolean
  created_at: string | null
  rotated_at: string | null
}

interface ApiParticipantResponse {
  id: string
  display_name: string
  role: string
  is_current_participant: boolean
  created_at?: string
  last_seen_at?: string | null
  session_expires_at?: string | null
  revoked_at?: string | null
  share_link_id?: string | null
  joined_via_role?: string | null
  access_source_label?: string
}

interface ApiJoinResponse {
  roadmap_id: string
  roadmap_name: string
  role: string
  session_token: string
  participant_id: string
}

const _LINK_META: Record<string, { icon: string; desc: string; recommended?: true }> = {
  owner: { icon: 'shield', desc: 'Full control — manage settings, links, and members.' },
  editor: { icon: 'users', desc: 'Can edit phases, tasks, and dependencies. Cannot delete the roadmap.', recommended: true },
  viewer: { icon: 'circle', desc: 'Read-only roadmap access. Treat this invite as a private credential.' },
}

function toShareLink(r: ApiShareLinkResponse): ShareLink {
  const meta = _LINK_META[r.role] ?? { icon: 'link', desc: r.role }
  return {
    id: r.id,
    role: r.role as ShareRole,
    icon: meta.icon,
    desc: meta.desc,
    url: r.url ?? '',
    isActive: r.is_active,
    tokenPrefix: r.token_prefix,
    createdAt: r.created_at,
    rotatedAt: r.rotated_at,
    ...(meta.recommended ? { recommended: true } : {}),
  }
}

function toParticipant(r: ApiParticipantResponse): Participant {
  return {
    id: r.id,
    displayName: r.display_name,
    role: r.role as ShareRole,
    isCurrentParticipant: r.is_current_participant,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    sessionExpiresAt: r.session_expires_at,
    revokedAt: r.revoked_at,
    shareLinkId: r.share_link_id,
    joinedViaRole: (r.joined_via_role ?? null) as ShareRole | null,
    accessSourceLabel: r.access_source_label,
  }
}

export async function getShareLinks(roadmapId: string, sessionToken: string): Promise<ShareLink[]> {
  const data = await requestJson<ApiShareLinkResponse[]>(
    `/api/roadmaps/${roadmapId}/share-links`,
    {},
    sessionToken,
  )
  return data.map(toShareLink)
}

export async function regenerateShareLink(
  roadmapId: string,
  role: string,
  sessionToken?: string,
): Promise<ShareLink> {
  const data = await requestJson<ApiShareLinkResponse>(
    `/api/roadmaps/${roadmapId}/share-links/${role}/rotate`,
    { method: 'POST' },
    sessionToken,
  )
  return toShareLink(data)
}

export async function revokeShareLink(
  roadmapId: string,
  role: string,
  sessionToken?: string,
): Promise<void> {
  await requestJson<void>(
    `/api/roadmaps/${roadmapId}/share-links/${role}`,
    { method: 'DELETE' },
    sessionToken,
  )
}

export async function getParticipants(
  roadmapId: string,
  sessionToken: string,
): Promise<Participant[]> {
  const data = await requestJson<ApiParticipantResponse[]>(
    `/api/roadmaps/${roadmapId}/participants`,
    {},
    sessionToken,
  )
  return data.map(toParticipant)
}

export async function revokeParticipant(
  roadmapId: string,
  participantId: string,
  sessionToken: string,
): Promise<void> {
  await requestJson<void>(
    `/api/roadmaps/${roadmapId}/participants/${participantId}/revoke`,
    { method: 'POST' },
    sessionToken,
  )
}

export async function joinRoadmap(
  token: string,
  displayName?: string,
  password?: string,
): Promise<{ roadmapId: string; roadmapName: string; role: string; sessionToken: string; participantId: string }> {
  const body: Record<string, unknown> = { token }
  if (displayName) body.display_name = displayName
  if (password) body.password = password
  const data = await requestJson<ApiJoinResponse>('/api/roadmaps/join', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const browserSessionToken = await resolveBrowserSessionToken(
    data.roadmap_id,
    data.session_token,
  )
  return {
    roadmapId: data.roadmap_id,
    roadmapName: data.roadmap_name,
    role: data.role,
    sessionToken: browserSessionToken,
    participantId: data.participant_id,
  }
}
