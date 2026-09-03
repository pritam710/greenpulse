from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    role = Column(String) # Citizen, Admin, Driver
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    green_credits = Column(Integer, default=0)

class Bin(Base):
    __tablename__ = "bins"
    id = Column(Integer, primary_key=True, index=True)
    location_lat = Column(Float)
    location_lng = Column(Float)
    zone = Column(String)
    fill_level = Column(Float, default=0.0) # 0 to 100
    battery_level = Column(Float, default=100.0)
    status = Column(String, default="Active")
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    citizen_id = Column(Integer, ForeignKey("users.id"))
    image_url = Column(String)
    location_lat = Column(Float)
    location_lng = Column(Float)
    waste_type = Column(String)
    severity = Column(String)
    status = Column(String, default="Pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class WorkOrder(Base):
    __tablename__ = "work_orders"
    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("users.id"))
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=True)
    bin_id = Column(Integer, ForeignKey("bins.id"), nullable=True)
    status = Column(String, default="Assigned")
    route_sequence = Column(Integer)
    proof_image_url = Column(String, nullable=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

# Separate tables keep existing reports intact; no destructive migration is needed.
class AuthSession(Base):
    __tablename__ = "auth_sessions"
    token_hash = Column(String, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(Float, nullable=False)

class ReportWorkflow(Base):
    __tablename__ = "report_workflows"
    report_id = Column(Integer, ForeignKey("reports.id"), primary_key=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    completion_note = Column(String, default="")
    proof_image_url = Column(String, default="")
    verification_note = Column(String, default="")
    reward_points = Column(Integer, default=0)

class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
