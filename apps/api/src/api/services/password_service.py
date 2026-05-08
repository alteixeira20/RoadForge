"""
Password hashing for roadmap password-gate feature.

Design:
- PBKDF2-SHA256 with 260,000 iterations and a 16-byte random salt.
- Stored format: pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
- Raw passwords are never logged or stored.
- Comparison uses hmac.compare_digest to resist timing attacks.
"""

import hashlib
import hmac
import secrets

_ALGORITHM = "pbkdf2_sha256"
_ITERATIONS = 260_000
_SALT_BYTES = 16


def hash_password(password: str) -> str:
    """Return a stored hash string for the given password."""
    salt = secrets.token_hex(_SALT_BYTES)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS)
    return f"{_ALGORITHM}${_ITERATIONS}${salt}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Return True if password matches stored_hash."""
    try:
        algorithm, iterations_str, salt, stored_dk_hex = stored_hash.split("$")
    except ValueError:
        return False
    if algorithm != _ALGORITHM:
        return False
    try:
        iterations = int(iterations_str)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations)
    return hmac.compare_digest(dk.hex(), stored_dk_hex)
