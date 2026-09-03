"""Server-owned identities, revocable sessions and bounded request throttling."""
import hashlib
import hmac
import secrets
import threading
import time
from collections import OrderedDict

from fastapi import Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from database import get_db

_buckets = OrderedDict()
_lock = threading.Lock()

def throttle(key, limit=5, period=60):
    # Single-process pilot limiter. Use a shared gateway/Redis limiter for multiple workers.
    now = time.monotonic()
    with _lock:
        start, count = _buckets.get(key, (now, 0))
        if now - start >= period:
            start, count = now, 0
        if count >= limit:
            raise HTTPException(429, "Too many attempts. Please try again later.",
                                headers={"Retry-After": str(max(1, int(period - (now - start))))})
        _buckets[key] = (start, count + 1)
        _buckets.move_to_end(key)
        while len(_buckets) > 10000:
            _buckets.popitem(last=False)

def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=32768, r=8, p=3, maxmem=67108864).hex()
    return f"scrypt${salt}${digest}"

def verify_password(password, encoded):
    try:
        algorithm, salt, expected = encoded.split("$")
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=32768, r=8, p=3, maxmem=67108864).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, AttributeError):
        return False

DUMMY_HASH = hash_password("dummy-password-not-an-account")

def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()

def current_user(request: Request, db: Session = Depends(get_db)):
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer ") or len(authorization) > 256:
        raise HTTPException(401, "Please sign in.")
    session = db.get(models.AuthSession, token_hash(authorization[7:]))
    if not session or session.expires_at <= time.time():
        raise HTTPException(401, "Session expired. Please sign in again.")
    user = db.get(models.User, session.user_id)
    if not user or user.role not in ("Citizen", "Admin", "Driver"):
        raise HTTPException(401, "Account unavailable.")
    return user

def safe_user(user):
    return {"id": user.id, "name": user.name, "role": user.role,
            "green_credits": user.green_credits or 0}

def next_user_id(db):
    # Never give a newly registered person ownership of legacy orphaned reports.
    return max(db.query(func.max(models.User.id)).scalar() or 0,
               db.query(func.max(models.Report.citizen_id)).scalar() or 0) + 1
