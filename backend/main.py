from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import models
from database import engine
from routers import reports

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="GreenPulse API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reports.router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Welcome to GreenPulse API"}
