import base64
import io
from datetime import datetime
from typing import Literal
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field, field_validator

def validate_image(value):
    if not value:
        return ""
    prefix, separator, encoded = value.partition(",")
    if not separator or prefix not in ("data:image/jpeg;base64", "data:image/png;base64", "data:image/webp;base64"):
        raise ValueError("Use a JPEG, PNG or WebP photo")
    try:
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError("Photo exceeds 2 MB")
        with Image.open(io.BytesIO(raw)) as im:
            if im.format not in ("JPEG", "PNG", "WEBP") or im.width * im.height > 16000000:
                raise ValueError("Invalid image dimensions or format")
            im.load()
            # Re-encoding discards EXIF, including hidden GPS, and other metadata.
            output = io.BytesIO()
            im.convert("RGB").save(output, format="JPEG", quality=85)
            clean = output.getvalue()
            if len(clean) > 2 * 1024 * 1024:
                raise ValueError("Photo exceeds 2 MB")
            return "data:image/jpeg;base64," + base64.b64encode(clean).decode()
    except Exception:
        raise ValueError("Invalid photo. Use JPEG, PNG or WebP under 2 MB and 16 megapixels.") from None

class ReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    image_url: str = Field(default="", max_length=2800000)
    location_lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    location_lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    waste_type: str = Field(min_length=3, max_length=1000)
    severity: Literal["Low", "Medium", "High", "Critical"] = "Medium"
    _image = field_validator("image_url")(validate_image)

class Transition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["Assigned", "In progress", "Cleaning", "Resolved", "Verified", "Citizen confirmed"]
    assigned_to: int | None = None
    completion_note: str = Field(default="", max_length=1000)
    proof_image_url: str = Field(default="", max_length=2800000)
    scale: Literal["false", "small", "medium", "large"] | None = None
    verification_note: str = Field(default="", max_length=1000)
    _image = field_validator("proof_image_url")(validate_image)

class ReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    image_url: str
    location_lat: float
    location_lng: float
    waste_type: str
    severity: str
    status: str
    created_at: datetime
    assigned_to: int | None = None
    completion_note: str = ""
    proof_image_url: str = ""
    verification_note: str = ""
    reward_points: int = 0
