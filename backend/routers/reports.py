from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db


router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=schemas.ReportResponse, status_code=status.HTTP_201_CREATED)
def create_report(report: schemas.ReportCreate, db: Session = Depends(get_db)):
    new_report = models.Report(
        **report.model_dump(exclude={"waste_type", "severity"}),
        waste_type=report.waste_type or "Unclassified",
        severity=report.severity or "Medium",
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    return new_report


@router.get("", response_model=list[schemas.ReportResponse])
def list_reports(db: Session = Depends(get_db)):
    return db.query(models.Report).order_by(models.Report.created_at.desc()).all()
