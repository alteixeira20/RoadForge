from datetime import datetime, timedelta, timezone

SESSION_LIFETIME_DAYS = 30

OWNER_ONLY = frozenset({"owner"})
OWNER_EDITOR = frozenset({"owner", "editor"})
ALL_ROLES = frozenset({"owner", "editor", "viewer"})
SHARE_PREFIXES: dict[str, str] = {
    "owner": "ow_",
    "editor": "ed_",
    "viewer": "vi_",
}

ROLE_ORDER: dict[str, int] = {"owner": 0, "editor": 1, "viewer": 2}

ROLE_LABELS: dict[str, str] = {
    "owner": "Owner link",
    "editor": "Editor link",
    "viewer": "Viewer link",
}


def ensure_aware_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def session_expires_at(now: datetime) -> datetime:
    return now + timedelta(days=SESSION_LIFETIME_DAYS)
