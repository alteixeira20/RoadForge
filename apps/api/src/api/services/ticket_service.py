import secrets
import time
from dataclasses import dataclass
from typing import Dict


@dataclass
class Ticket:
    roadmap_id: str
    participant_id: str
    expires_at: float


class TicketService:
    def __init__(self, ttl: int = 30):
        self._tickets: Dict[str, Ticket] = {}
        self._ttl = ttl

    def create_ticket(self, roadmap_id: str, participant_id: str) -> str:
        # Opportunistic cleanup
        self._cleanup()
        
        ticket_id = secrets.token_urlsafe(32)
        self._tickets[ticket_id] = Ticket(
            roadmap_id=roadmap_id,
            participant_id=participant_id,
            expires_at=time.time() + self._ttl
        )
        return ticket_id

    def consume_ticket(self, ticket_id: str, roadmap_id: str) -> str | None:
        ticket = self._tickets.pop(ticket_id, None)
        if not ticket:
            return None
        
        if ticket.roadmap_id != roadmap_id or time.time() > ticket.expires_at:
            return None
            
        return ticket.participant_id

    def _cleanup(self):
        now = time.time()
        expired = [tid for tid, t in self._tickets.items() if now > t.expires_at]
        for tid in expired:
            del self._tickets[tid]


# Global ticket service instance
ticket_service = TicketService()
