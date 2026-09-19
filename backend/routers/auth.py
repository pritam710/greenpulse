import re
import secrets
import time
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from config import settings
from database import get_db
from security import (DUMMY_HASH, current_user, hash_password, next_user_id,
                      safe_user, throttle, token_hash, verify_password)

router = APIRouter(prefix="/auth", tags=["authentication"])

def is_owner(user):
    return bool(settings.bootstrap_admin_email) and user.role == "Admin" and \
        user.email == settings.bootstrap_admin_email.strip().lower()

def session_user(user):
    return {**safe_user(user), "is_owner": is_owner(user)}

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
    consent_accepted: Literal[True]
    policy_version: Literal["2026-09-06", "2026-09-19"]

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value):
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()

class StaffRegistration(Credentials):
    name: str = Field(min_length=1, max_length=80)
    role: Literal["Admin", "Driver"]

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
        db.flush()
        db.add(models.ConsentEvent(user_id=user.id, purpose="Account registration",
                                   policy_version=body.policy_version))
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
    return {"token": token, "user": session_user(user)}

@router.get("/me")
def me(user=Depends(current_user)):
    return session_user(user)

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

@router.post("/staff", status_code=201)
def create_staff(body: StaffRegistration, request: Request,
                 user=Depends(current_user), db: Session = Depends(get_db)):
    if not is_owner(user):
        raise HTTPException(403, "Owner access required.")
    throttle(("staff-create", user.id), 10, 3600)
    staff_user = models.User(id=next_user_id(db), name=body.name, email=body.email,
                             password_hash=hash_password(body.password), role=body.role,
                             green_credits=0)
    db.add(staff_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with that email already exists.")
    return {"message": f"{body.role} account created.", "user": safe_user(staff_user)}

@router.get("/staff/manage")
def manage_staff(user=Depends(current_user), db: Session = Depends(get_db)):
    if not is_owner(user):
        raise HTTPException(403, "Owner access required.")
    return [{"id": account.id, "name": account.name, "email": account.email,
             "role": account.role, "is_owner": is_owner(account)} for account in
            db.query(models.User).filter(models.User.role.in_(("Admin", "Driver"))).order_by(models.User.name).all()]

@router.delete("/staff/{staff_id}")
def revoke_staff(staff_id: int, user=Depends(current_user), db: Session = Depends(get_db)):
    if not is_owner(user):
        raise HTTPException(403, "Owner access required.")
    # Serialize revocation with assignments and worker actions. On PostgreSQL,
    # every competing operation locks this account before locking a report.
    account = db.query(models.User).filter(models.User.id == staff_id).populate_existing().with_for_update().first()
    if not account or account.role not in ("Admin", "Driver"):
        raise HTTPException(404, "Staff account not found.")
    if account.id == user.id or is_owner(account):
        raise HTTPException(409, "The GreenPulse owner account cannot be removed.")
    previous_role = account.role
    requeued = 0
    if previous_role == "Driver":
        active = db.query(models.Report).join(models.ReportWorkflow).filter(
            models.ReportWorkflow.assigned_to == account.id,
            models.Report.status.in_(("Assigned", "In progress", "Cleaning")),
        ).order_by(models.Report.id).with_for_update().all()
        for report in active:
            previous_status = report.status
            changed = db.query(models.Report).filter(
                models.Report.id == report.id, models.Report.status == previous_status,
            ).update({models.Report.status: "Pending"}, synchronize_session=False)
            if changed != 1:
                db.rollback()
                raise HTTPException(409, "A task changed during revocation. Refresh and retry.")
            workflow = db.get(models.ReportWorkflow, report.id)
            workflow.assigned_to = None
            db.add(models.AuditEvent(
                report_id=report.id, actor_id=user.id,
                action=f"Worker access revoked; {previous_status} task returned to Pending for reassignment",
            ))
            requeued += 1
        # Completion notes, photos, rewards and existing audit history are kept.
    account.role = "Disabled"
    db.query(models.AuthSession).filter(models.AuthSession.user_id == account.id).delete()
    db.commit()
    return {"message": f"{previous_role} access revoked for {account.name}. {requeued} active task(s) returned to Pending for reassignment.",
            "requeued_tasks": requeued}
