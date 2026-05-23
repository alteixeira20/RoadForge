"""
Token utilities for invite links and participant sessions.

Design:
- Raw tokens are generated with secrets.token_urlsafe(32) — 256 bits of entropy.
- Private owner/editor tokens and session tokens are stored only as SHA-256
  hex digests; public viewer/demo tokens may be stored by the roadmap service
  so owners can re-copy read-only links.
- token_prefix is a short non-secret display string (first 8 chars of the raw
  token) used in the ShareModal UI and logs for identification without exposing
  the secret.
- Comparison uses hmac.compare_digest to resist timing attacks.
"""

import hashlib
import hmac
import secrets


def generate_token(prefix: str) -> str:
    """Return a prefixed URL-safe random token.

    Example: generate_token("ed_") -> "ed_3Xk7...mQ9z"
    The prefix is a role hint, not a security mechanism.
    """
    random_part = secrets.token_urlsafe(32)
    return f"{prefix}{random_part}"


def hash_token(token: str) -> str:
    """Return the SHA-256 hex digest of a token for database storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def token_prefix(token: str) -> str:
    """Return the first 8 characters of the token as a non-secret display prefix.

    For a token like "ed_3Xk7mQ9z...", this returns "ed_3Xk7m".
    The prefix is safe to store and show in logs and UIs.
    """
    return token[:8]


def constant_time_equals(a: str, b: str) -> bool:
    """Compare two strings in constant time to resist timing attacks."""
    return hmac.compare_digest(a.encode(), b.encode())


def verify_token(raw_token: str, stored_hash: str) -> bool:
    """Return True if hash_token(raw_token) matches stored_hash."""
    return constant_time_equals(hash_token(raw_token), stored_hash)
