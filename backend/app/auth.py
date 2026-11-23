"""Accounts: scrypt password hashes (standard library) and signed JWT access tokens."""
from __future__ import annotations

import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import db

DEV_SECRET = "dev-only-secret-change-me"
TOKEN_DAYS = int(os.getenv("TOKEN_DAYS", "7"))
_bearer = HTTPBearer(auto_error=False)


def secret() -> str:
    value = os.getenv("SECRET_KEY", "")
    if value:
        return value
    if os.getenv("ENV", "dev").lower() == "production":
        raise RuntimeError("SECRET_KEY must be set when ENV=production")
    return DEV_SECRET


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


DUMMY_HASH = hash_password("not-a-real-password")  # checked when the email is unknown, so timing does not reveal it


def create_token(user: db.User) -> str:
    payload = {"sub": str(user.id), "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)}
    return jwt.encode(payload, secret(), algorithm="HS256")


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer), s: Session = Depends(db.get_session)) -> db.User:
    if creds is None:
        raise HTTPException(401, "Please log in.")
    try:
        user_id = int(jwt.decode(creds.credentials, secret(), algorithms=["HS256"])["sub"])
    except Exception:
        raise HTTPException(401, "Your session has expired. Please log in again.")
    user = s.get(db.User, user_id)
    if user is None:
        raise HTTPException(401, "Your session has expired. Please log in again.")
    return user
