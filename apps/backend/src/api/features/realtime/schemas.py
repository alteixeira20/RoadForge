"""Event ticket schemas."""

from __future__ import annotations

from pydantic import BaseModel


class EventTicketResponse(BaseModel):
    # The ticket itself is delivered only in a scoped HttpOnly cookie.
    expires_in: int
