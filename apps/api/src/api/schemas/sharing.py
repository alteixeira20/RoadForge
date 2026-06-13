"""Share link & participant schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from api.schemas.shared import ShareRole


class ShareLinkResponse(BaseModel):
    id: str | None
    role: ShareRole
    # Readable prefix shown in UI; not the secret token.
    token_prefix: str | None = None
    # Full join URL with the raw token embedded.
    # Owner/editor URLs are returned only on create/rotate.
    # Active viewer URLs may also be returned by owner-only share-link listing.
    url: str | None = None
    is_active: bool
    created_at: datetime | None = None
    rotated_at: datetime | None = None


class ParticipantResponse(BaseModel):
    id: str
    display_name: str
    role: ShareRole
    created_at: datetime
    last_seen_at: datetime | None = None
    session_expires_at: datetime | None = None
    revoked_at: datetime | None = None
    is_current_participant: bool = False
    share_link_id: str | None = None
    joined_via_role: ShareRole | None = None
    access_source_label: str = "Legacy / unknown link"