// ─── Sharing service ────────────────────────────────────────────────────────────
// Join roadmap via invite, share-link management, and participant management.

import type { ShareLink, ShareRole, Participant } from '@/types/roadmap'
import { requestJson } from './roadmap-http'

// ─── Backend response shapes (local to this file) ─────────────────────────────

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
  created_at: string
  last_seen_at: string | null
  revoked_at: string | null
  is_current_participant: boolean
  share_link_id: string | null
  joined_via_role: string | null
  access_source_label: string
}

interface ApiJoinResponse {
  roadmap_id: string
  roadmap_name: string
  role: string
  session_token: string
  participant_id: string
}

// ─── Mappers ───────────────────────────────────────────────────────────────────

// Matches icon/desc/recommended from MOCK_SHARE_LINKS in sample-roadmap.ts.
const _LINK_META: Record<string, { icon: string; desc: string; recommended?: true }> = {
  owner:  { icon: 'shield', desc: 'Full control — manage settings, links, and members.' },
  editor: { icon: 'users',  desc: 'Can edit phases, tasks, and dependencies. Cannot delete the roadmap.', recommended: true },
  viewer: { icon: 'circle', desc: 'Anyone with this link can view this roadmap read-only. Good for public demos.' },
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
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    revokedAt: r.revoked_at,
    isCurrentParticipant: r.is_current_participant,
    shareLinkId: r.share_link_id ?? null,
    joinedViaRole: (r.joined_via_role ?? null) as ShareRole | null,
    accessSourceLabel: r.access_source_label ?? 'Legacy / unknown link',
  }
}

// ─── Share links ───────────────────────────────────────────────────────────────

/**
 * Fetch share-link states for all roles on a roadmap.
 * url is empty string when null — raw tokens are not re-exposed after creation.
 */
export async function getShareLinks(roadmapId: string, sessionToken: string): Promise<ShareLink[]> {
  const data = await requestJson<ApiShareLinkResponse[]>(
    `/api/roadmaps/${roadmapId}/share-links`,
    {},
    sessionToken,
  )
  return data.map(toShareLink)
}

/**
 * Rotate a share link for the given role. Returns the link with the new join URL
 * (the raw token is only available in this response).
 */
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

/**
 * Revoke a share link so it can no longer be used to join.
 */
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

// ─── Participants ──────────────────────────────────────────────────────────────

/**
 * Fetch joined participant sessions for owner management.
 */
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

/**
 * Revoke a joined participant session. This does not revoke invite links.
 */
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

// ─── Invite / join ─────────────────────────────────────────────────────────────

/**
 * Accept a share-link invite and join the roadmap.
 * display_name is optional — backend assigns a role-based default if omitted.
 * password is required when the roadmap has password protection enabled.
 */
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
  return {
    roadmapId: data.roadmap_id,
    roadmapName: data.roadmap_name,
    role: data.role,
    sessionToken: data.session_token,
    participantId: data.participant_id,
  }
}
