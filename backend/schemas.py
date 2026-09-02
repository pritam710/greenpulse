from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ReportCreate(BaseModel):
    citizen_id: int
    image_url: str
    location_lat: float = Field(ge=-90, le=90)
    location_lng: float = Field(ge=-180, le=180)
    waste_type: Optional[str] = None
    severity: Optional[str] = None

class ReportResponse(BaseModel):
    id: int
    citizen_id: int
    image_url: str
    location_lat: float
    location_lng: float
    waste_type: str
    severity: str
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True
