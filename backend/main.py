import logging
import secrets
from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import models
from database import engine
from routers import reports, auth
from config import settings
from security import throttle

models.Base.metadata.create_all(bind=engine)

production = settings.environment == "production"
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
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(reports.router)
app.include_router(auth.router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Welcome to GreenPulse API"}
