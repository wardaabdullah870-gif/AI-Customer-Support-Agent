"""Single-administrator authentication helpers for the customer support API."""

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
import secrets

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError

# Matches the password-hash format produced by create_admin_password_hash.py.
_HASH_ALGORITHM = "pbkdf2_sha256"
_DEFAULT_HASH_ROUNDS = 600_000
_TOKEN_LIFETIME_MINUTES = 30
_bearer_scheme = HTTPBearer(auto_error=False)


def _auth_settings() -> tuple[str, str, str]:
    """Read auth settings at request time so .env can be loaded by main.py."""
    username = os.getenv("ADMIN_USERNAME", "").strip()
    password_hash = os.getenv("ADMIN_PASSWORD_HASH", "").strip()
    secret_key = os.getenv("JWT_SECRET_KEY", "").strip()

    if not username or not password_hash or not secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Administrator authentication is not configured. "
                "Set ADMIN_USERNAME, ADMIN_PASSWORD_HASH, and JWT_SECRET_KEY in .env."
            ),
        )
    if len(secret_key) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT_SECRET_KEY must contain at least 32 characters.",
        )
    return username, password_hash, secret_key


def _verify_password(password: str, stored_hash: str) -> bool:
    """Verify a PBKDF2-SHA256 password hash using constant-time comparison."""
    try:
        algorithm, rounds_text, salt_hex, expected_hex = stored_hash.split("$", 3)
        rounds = int(rounds_text)
        if algorithm != _HASH_ALGORITHM or not 100_000 <= rounds <= 2_000_000:
            return False
        salt = bytes.fromhex(salt_hex)
        expected_digest = bytes.fromhex(expected_hex)
        actual_digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, rounds, dklen=len(expected_digest)
        )
        return hmac.compare_digest(actual_digest, expected_digest)
    except (ValueError, TypeError):
        return False


def verify_admin_credentials(username: str, password: str) -> bool:
    configured_username, password_hash, _ = _auth_settings()
    username_matches = hmac.compare_digest(
        username.strip().encode("utf-8"), configured_username.encode("utf-8")
    )
    password_matches = _verify_password(password, password_hash)
    return username_matches and password_matches


def create_admin_access_token(username: str) -> str:
    configured_username, _, secret_key = _auth_settings()
    if not hmac.compare_digest(username, configured_username):
        raise HTTPException(status_code=401, detail="Invalid administrator credentials.")

    now = datetime.now(timezone.utc)
    payload = {
        "sub": configured_username,
        "role": "admin",
        "iat": now,
        "exp": now + timedelta(minutes=_TOKEN_LIFETIME_MINUTES),
    }
    return jwt.encode(payload, secret_key, algorithm="HS256")


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> str:
    """FastAPI dependency that rejects requests without a valid admin token."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Administrator login is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    configured_username, _, secret_key = _auth_settings()
    try:
        payload = jwt.decode(
            credentials.credentials,
            secret_key,
            algorithms=["HS256"],
            options={"require": ["exp", "iat", "sub"]},
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your administrator session is invalid or expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    subject = payload.get("sub")
    role = payload.get("role")
    if (
        not isinstance(subject, str)
        or not hmac.compare_digest(subject, configured_username)
        or role != "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access is required.",
        )
    return subject
