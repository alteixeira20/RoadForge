import secrets


def generate_id(prefix: str) -> str:
    """Return a prefixed URL-safe random ID.

    Uses 16 bytes (128 bits) of entropy — compact (~22 base64 chars) and safe
    to embed in URLs and JSON. Example: generate_id("rm_") -> "rm_3Xk7mQ9z..."
    """
    return f"{prefix}{secrets.token_urlsafe(16)}"
