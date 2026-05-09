"""
Text validation helpers for request schemas.

Design:
- Strip leading/trailing whitespace before any check.
- Reject blank required fields; normalise blank optional fields to None.
- Reject ASCII control characters (except tab, newline, carriage return).
- Reject strings containing known injection fragments as a defence-in-depth
  measure. React escapes at render time, but we prefer to reject at ingest.
- Raise ValueError so Pydantic converts it to a 422 ValidationError.
- Never silently truncate — callers must enforce length before storing.
"""

import re

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SUSPICIOUS = ("<script", "javascript:", "data:text/html")


def reject_suspicious_text(value: str, field_name: str) -> None:
    if _CONTROL_CHARS.search(value):
        raise ValueError(f"{field_name} contains invalid control characters")
    lower = value.lower()
    for fragment in _SUSPICIOUS:
        if fragment in lower:
            raise ValueError(f"{field_name} contains invalid content")


def clean_required_text(value: str, field_name: str, max_length: int) -> str:
    value = value.strip()
    if not value:
        raise ValueError(f"{field_name} must not be blank")
    if len(value) > max_length:
        raise ValueError(f"{field_name} exceeds {max_length} characters")
    reject_suspicious_text(value, field_name)
    return value


def clean_optional_text(value: str | None, field_name: str, max_length: int) -> str | None:
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if not stripped:
        return None
    if len(stripped) > max_length:
        raise ValueError(f"{field_name} exceeds {max_length} characters")
    reject_suspicious_text(stripped, field_name)
    return stripped
