from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from security import current_user, throttle


router = APIRouter(prefix="/reports", tags=["reports"])


def visible_query(db, user):
    query = db.query(models.Report)
    if user.role == "Citizen":
        query = query.filter(models.Report.citizen_id == user.id)
    elif user.role == "Driver":
        query = query.join(models.ReportWorkflow).filter(models.ReportWorkflow.assigned_to == user.id)
    return query

def output(db, report):
    value = schemas.ReportResponse.model_validate(report).model_dump()
    workflow = db.get(models.ReportWorkflow, report.id)
    if workflow:
        for key in ("assigned_to", "completion_note", "proof_image_url", "verification_note", "reward_points"):
            value[key] = getattr(workflow, key)
    return value

@router.post("", response_model=schemas.ReportResponse, status_code=201)
def create_report(body: schemas.ReportCreate, user=Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "Citizen":
        raise HTTPException(403, "Use a citizen account to submit a report.")
    throttle(("report", user.id), 10, 3600)
    report = models.Report(**body.model_dump(), citizen_id=user.id, status="Pending")
    db.add(report)
    db.flush()
    db.add(models.ReportWorkflow(report_id=report.id))
    db.add(models.AuditEvent(report_id=report.id, actor_id=user.id, action="Report submitted"))
    db.commit()
    db.refresh(report)
    return output(db, report)


@router.get("", response_model=list[schemas.ReportResponse])
def list_reports(offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=100),
                 user=Depends(current_user), db: Session = Depends(get_db)):
    rows = visible_query(db, user).order_by(models.Report.id.desc()).offset(offset).limit(limit).all()
    result = []
    for row in rows:
        value = output(db, row)
        value["image_url"] = ""
        value["proof_image_url"] = ""
        result.append(value)
    return result

@router.get("/{report_id}", response_model=schemas.ReportResponse)
def detail(report_id: int, user=Depends(current_user), db: Session = Depends(get_db)):
    report = visible_query(db, user).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Report not found.")
    return output(db, report)

@router.get("/{report_id}/audit")
def audit(report_id: int, user=Depends(current_user), db: Session = Depends(get_db)):
    if not visible_query(db, user).filter(models.Report.id == report_id).first():
        raise HTTPException(404, "Report not found.")
    rows = db.query(models.AuditEvent).filter(models.AuditEvent.report_id == report_id).order_by(models.AuditEvent.id).all()
    return [{"action": r.action, "time": r.created_at} for r in rows]

@router.patch("/{report_id}/status", response_model=schemas.ReportResponse)
def transition(report_id: int, body: schemas.Transition, user=Depends(current_user), db: Session = Depends(get_db)):
    throttle(("workflow", user.id), 60, 60)
    report = visible_query(db, user).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Report not found.")
    workflow = db.get(models.ReportWorkflow, report_id)
    if not workflow:
        workflow = models.ReportWorkflow(report_id=report_id)
        db.add(workflow)
    allowed = {("Pending", "Assigned"): "Admin", ("Assigned", "In progress"): "Driver",
               ("In progress", "Cleaning"): "Driver", ("Cleaning", "Resolved"): "Driver",
               ("Resolved", "Verified"): "Admin", ("Verified", "Citizen confirmed"): "Citizen"}
    required = allowed.get((report.status, body.status))
    if required is None:
        raise HTTPException(409, "Invalid or already completed status change. Refresh the report.")
    if user.role != required:
        raise HTTPException(403, "Your role cannot perform this action.")
    fields = body.model_fields_set - {"status"}
    permitted = {"Assigned": {"assigned_to"}, "Resolved": {"completion_note", "proof_image_url"},
                 "Verified": {"scale", "verification_note"}}.get(body.status, set())
    if fields - permitted:
        raise HTTPException(422, "Unexpected fields for this status change.")
    if body.status == "Assigned":
        staff = db.get(models.User, body.assigned_to) if body.assigned_to else None
        if not staff or staff.role != "Driver":
            raise HTTPException(422, "Choose a registered field worker.")
        workflow.assigned_to = staff.id
    if body.status == "Resolved":
        if not body.completion_note.strip() or not body.proof_image_url:
            raise HTTPException(422, "A completion note and evidence photo are required.")
        workflow.completion_note = body.completion_note.strip()
        workflow.proof_image_url = body.proof_image_url
    if body.status == "Verified":
        if body.scale is None or not body.verification_note.strip() or not workflow.proof_image_url:
            raise HTTPException(422, "Review evidence, select the actual scale and provide a verification note.")
        workflow.reward_points = {"false": 0, "small": 10, "medium": 20, "large": 30}[body.scale]
        workflow.verification_note = body.verification_note.strip()
    # Atomic status check prevents duplicate credits from concurrent verification requests.
    changed = db.query(models.Report).filter(models.Report.id == report.id,
                                             models.Report.status == report.status).update(
        {models.Report.status: body.status}, synchronize_session=False)
    if changed != 1:
        db.rollback()
        raise HTTPException(409, "Report changed. Please refresh.")
    if body.status == "Verified":
        db.query(models.User).filter(models.User.id == report.citizen_id).update(
            {models.User.green_credits: models.User.green_credits + workflow.reward_points}, synchronize_session=False)
    db.add(models.AuditEvent(report_id=report.id, actor_id=user.id, action=f"Status changed to {body.status}"))
    db.commit()
    db.refresh(report)
    return output(db, report)
