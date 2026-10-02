import logging
import secrets
import threading
from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import models
from database import SessionLocal
from evaluator_demo import DEMO_ACCOUNTS
from routers import reports, auth, classification
from config import settings
from security import hash_password, next_user_id, throttle

production = settings.environment == "production"


def promote_bootstrap_owner():
    """Promote the configured private owner without delaying the health check."""
    if not settings.bootstrap_admin_email:
        return
    with SessionLocal() as db:
        owner = db.query(models.User).filter(
            models.User.email == settings.bootstrap_admin_email.strip().lower()).first()
        if owner and owner.role != "Admin":
            owner.role = "Admin"
            db.commit()


def seed_evaluator_demo():
    """Provision public, role-limited evaluator accounts and demo-only reports."""
    if not (production and settings.enable_evaluator_accounts):
        return
    with SessionLocal() as db:
        accounts = {}
        for role, details in DEMO_ACCOUNTS.items():
            account = db.query(models.User).filter(models.User.email == details["email"]).first()
            if not account:
                account = models.User(id=next_user_id(db), green_credits=0, **details, role=role)
                db.add(account)
                db.flush()
            else:
                account.name = details["name"]
                account.role = role
                account.password_hash = details["password_hash"]
            accounts[role] = account

        citizen, worker, admin = accounts["Citizen"], accounts["Driver"], accounts["Admin"]
        has_reports = db.query(models.Report.id).filter(models.Report.citizen_id == citizen.id).first()
        if not has_reports:
            samples = [
                ("[DEMO] Mixed waste near college canteen", "High", "Pending", 17.6599, 75.9064),
                ("[DEMO] Plastic bottles beside bus stop", "Medium", "Assigned", 17.6622, 75.9101),
                ("[DEMO] Wet waste at vegetable market", "Critical", "In progress", 17.6548, 75.9018),
                ("[DEMO] Construction debris on roadside", "High", "Cleaning", 17.6684, 75.9152),
                ("[DEMO] Sanitary waste near public facility", "High", "Resolved", 17.6507, 75.9138),
                ("[DEMO] Paper and cardboard collection", "Low", "Verified", 17.6651, 75.8976),
            ]
            stages = ["Pending", "Assigned", "In progress", "Cleaning", "Resolved", "Verified"]
            proof = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
            for waste_type, severity, status, lat, lng in samples:
                report = models.Report(citizen_id=citizen.id, image_url="", location_lat=lat,
                                       location_lng=lng, waste_type=waste_type,
                                       severity=severity, status=status)
                db.add(report)
                db.flush()
                reached = stages.index(status)
                db.add(models.ReportWorkflow(
                    report_id=report.id,
                    assigned_to=worker.id if reached >= 1 else None,
                    completion_note="Demo waste collected and transferred to the designated stream." if reached >= 4 else "",
                    proof_image_url=proof if reached >= 4 else "",
                    verification_note="Demo completion evidence reviewed by the evaluator administrator." if reached >= 5 else "",
                    reward_points=20 if reached >= 5 else 0,
                ))
                db.add(models.AuditEvent(report_id=report.id, actor_id=citizen.id,
                                         action="Evaluator demo report submitted"))
                for index, stage in enumerate(stages[1:reached + 1], start=1):
                    actor = worker if index in (2, 3, 4) else admin
                    db.add(models.AuditEvent(report_id=report.id, actor_id=actor.id,
                                             action=f"Status changed to {stage}"))
            citizen.green_credits = 20
        db.commit()

def seed_judge_demo():
    """Create one idempotent, clearly labelled demonstration workflow dataset."""
    if not settings.seed_demo_reports:
        return
    with SessionLocal() as db:
        citizen = db.query(models.User).filter(models.User.email == "judge-demo@greenpulse.local").first()
        if citizen and db.query(models.Report).filter(models.Report.citizen_id == citizen.id).first():
            return
        if not citizen:
            citizen = models.User(id=next_user_id(db), name="GreenPulse Demo Citizen",
                                  email="judge-demo@greenpulse.local", role="Citizen",
                                  password_hash=hash_password(secrets.token_urlsafe(32)), green_credits=0)
            db.add(citizen); db.flush()
        worker = db.query(models.User).filter(models.User.email == "demo-field-team@greenpulse.local").first()
        if not worker:
            worker = models.User(id=next_user_id(db), name="Demo Field Team",
                                 email="demo-field-team@greenpulse.local", role="Driver",
                                 password_hash=hash_password(secrets.token_urlsafe(32)), green_credits=0)
            db.add(worker); db.flush()
        owner = db.query(models.User).filter(models.User.email == settings.bootstrap_admin_email.strip().lower()).first() or worker
        samples = [
            ("Overflowing mixed waste near college canteen", "High", "Pending", 17.6599, 75.9064),
            ("Plastic bottles beside bus stop", "Medium", "Assigned", 17.6622, 75.9101),
            ("Wet waste accumulation at vegetable market", "Critical", "In progress", 17.6548, 75.9018),
            ("Construction debris obstructing roadside", "High", "Cleaning", 17.6684, 75.9152),
            ("Sanitary waste near public facility", "High", "Resolved", 17.6507, 75.9138),
            ("Recyclable paper and cardboard pile", "Low", "Verified", 17.6651, 75.8976),
        ]
        stages = ["Pending", "Assigned", "In progress", "Cleaning", "Resolved", "Verified"]
        proof = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        for waste_type, severity, status, lat, lng in samples:
            report = models.Report(citizen_id=citizen.id, image_url="", location_lat=lat,
                                   location_lng=lng, waste_type=waste_type, severity=severity, status=status)
            db.add(report); db.flush()
            reached = stages.index(status)
            workflow = models.ReportWorkflow(report_id=report.id,
                assigned_to=worker.id if reached >= 1 else None,
                completion_note="Waste collected, segregated and transferred to the designated facility." if reached >= 4 else "",
                proof_image_url=proof if reached >= 4 else "",
                verification_note="Completion evidence checked by the municipal administrator." if reached >= 5 else "",
                reward_points=20 if reached >= 5 else 0)
            db.add(workflow)
            db.add(models.AuditEvent(report_id=report.id, actor_id=citizen.id, action="Judge demo report submitted"))
            for index, stage in enumerate(stages[1:reached + 1], start=1):
                actor = worker if index in (2, 3, 4) else owner
                db.add(models.AuditEvent(report_id=report.id, actor_id=actor.id, action=f"Status changed to {stage}"))
        citizen.green_credits = 20
        db.commit()

def initialize_operational_data():
    """Run database-dependent startup work away from the public health route."""
    try:
        promote_bootstrap_owner()
        seed_judge_demo()
        seed_evaluator_demo()
    except Exception:
        logging.getLogger("greenpulse").error("Background data initialization failed.")


if settings.bootstrap_admin_email or settings.seed_demo_reports or (production and settings.enable_evaluator_accounts):
    threading.Thread(target=initialize_operational_data,
                     name="greenpulse-data-initializer", daemon=True).start()

origins = [origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()]
if not origins or "*" in origins or (production and any(not o.startswith("https://") for o in origins)):
    raise RuntimeError("Configure explicit allowed origins; production requires HTTPS.")
app = FastAPI(title="GreenPulse API", docs_url=None if production else "/docs",
              redoc_url=None, openapi_url=None if production else "/openapi.json")

@app.middleware("http")
async def safety_headers(request: Request, call_next):
    request_id = secrets.token_hex(8)
    response = None
    try:
        throttle(("requests", request.client.host), 120, 60)
    except HTTPException as exc:
        response = JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers)
    # Bound streamed bodies too, rather than trusting Content-Length.
    if response is None and request.method in ("POST", "PATCH", "PUT"):
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 3 * 1024 * 1024:
                response = JSONResponse({"detail": "Request exceeds 3 MB."}, status_code=413)
                break
        if response is None:
            request._body = bytes(body)
    if response is None:
        try:
            response = await call_next(request)
        except Exception:
            # Never log request bodies, credentials, SQL values or raw exception text.
            logging.getLogger("greenpulse").error("Request failed; reference=%s", request_id)
            response = JSONResponse({"detail": "Request failed. Please retry.", "reference": request_id}, status_code=500)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    if production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return response

@app.exception_handler(RequestValidationError)
async def invalid_input(request, exc):
    # FastAPI's default validation response can echo passwords and uploaded data.
    return JSONResponse({"detail": "Invalid input. Check required fields, password length and photo limits."}, status_code=422)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(reports.router)
app.include_router(auth.router)
app.include_router(classification.router)

@app.get("/")
def read_root():
    return {"status": "ok", "service": "GreenPulse API", "release": "2026-10-02-evaluator"}


@app.get("/ready")
def read_ready():
    """Warm the database before a visitor submits credentials."""
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ready"}
