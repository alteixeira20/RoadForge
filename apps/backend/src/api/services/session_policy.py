from datetime import datetime, timedelta, timezone

SESSION_LIFETIME_DAYS = 30


def ensure_aware_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def session_expires_at(now: datetime) -> datetime:
    return now + timedelta(days=SESSION_LIFETIME_DAYS)
