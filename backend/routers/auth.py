import re
import secrets
import time
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from config import settings
from database import get_db
from security import (DUMMY_HASH, current_user, hash_password, next_user_id,
                      safe_user, throttle, token_hash, verify_password)

router = APIRouter(prefix="/auth", tags=["authentication"])

class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def email_format(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address")
        return value

class Registration(Credentials):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value):
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()

@router.post("/register", status_code=201)
def register(body: Registration, request: Request, db: Session = Depends(get_db)):
    throttle(("register", request.client.host), 5, 3600)
    user = models.User(id=next_user_id(db), name=body.name.strip(), email=body.email,
                       password_hash=hash_password(body.password), role="Citizen", green_credits=0)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Account could not be created. Try signing in or retry later.")
    return {"message": "Account created. Please sign in."}

@router.post("/login")
def login(body: Credentials, request: Request, db: Session = Depends(get_db)):
    throttle(("login-ip", request.client.host), 5, 60)
    throttle(("login-account", body.email), 10, 60)
    user = db.query(models.User).filter(models.User.email == body.email).first()
    valid = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not valid or not user or user.role not in ("Citizen", "Admin", "Driver"):
        raise HTTPException(401, "Email or password is incorrect.")
    db.query(models.AuthSession).filter(models.AuthSession.expires_at <= time.time()).delete()
    token = secrets.token_urlsafe(32)
    db.add(models.AuthSession(token_hash=token_hash(token), user_id=user.id,
                             expires_at=time.time() + settings.session_hours * 3600))
    db.commit()
    return {"token": token, "user": safe_user(user)}

@router.get("/me")
def me(user=Depends(current_user)):
    return safe_user(user)

@router.post("/logout", status_code=204)
def logout(request: Request, user=Depends(current_user), db: Session = Depends(get_db)):
    db.query(models.AuthSession).filter(
        models.AuthSession.token_hash == token_hash(request.headers["Authorization"][7:])).delete()
    db.commit()

@router.get("/staff")
def staff(user=Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "Admin":
        raise HTTPException(403, "Administrator access required.")
    return [{"id": u.id, "name": u.name} for u in
            db.query(models.User).filter(models.User.role == "Driver").all()]
