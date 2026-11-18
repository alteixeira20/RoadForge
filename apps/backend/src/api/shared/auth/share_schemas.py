"""Share link response schema shared across auth and sharing."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ShareRole = Literal["owner", "editor", "viewer"]

class ShareLinkResponse(BaseModel):
    id: str | None
    role: ShareRole
    # Readable prefix shown in UI; not the secret token.
    token_prefix: str | None = None
    # Full fragment-based join URL with the raw token embedded.
    # Every role is reveal-once: URLs are returned only on create/rotate.
    url: str | None = None
    is_active: bool
    created_at: datetime | None = None
    rotated_at: datetime | None = None
