"""Event ticket schemas."""

from __future__ import annotations

from pydantic import BaseModel


class EventTicketResponse(BaseModel):
    ticket: str
    expires_in: int
