from datetime import time
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict, computed_field, field_validator


# ---------- Short schemas (no cycles) ----------

class AddressShortOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class CameraShortOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class RoomShortOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: Optional[AddressShortOut] = None
    cameras: List[CameraShortOut] = []


class ScheduleTemplateShortOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    day_of_week: int
    start_time: time
    end_time: time
    is_active: bool


# ---------- Address schemas ----------

class AddressBase(BaseModel):
    name: str = Field(..., min_length=1)


class AddressCreate(AddressBase):
    pass


class AddressUpdate(BaseModel):
    name: Optional[str] = None


class AddressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    rooms: List[RoomShortOut] = []


# ---------- Room schemas ----------

class RoomBase(BaseModel):
    address_id: int
    name: str = Field(..., min_length=1)


class RoomCreate(RoomBase):
    pass


class RoomUpdate(BaseModel):
    address_id: Optional[int] = None
    name: Optional[str] = None


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    address_id: int
    name: str
    address: Optional[AddressShortOut] = None
    cameras: List[CameraShortOut] = []


# ---------- Profile schemas ----------

class ProfileBase(BaseModel):
    name: str = Field(..., min_length=1)
    username: str = Field(..., min_length=1)


class ProfileCreate(ProfileBase):
    password: str = Field(..., min_length=1)


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    username: str
    password: str = Field(default="", exclude=True)


# ---------- Camera schemas ----------

class CameraBase(BaseModel):
    name: str = Field(..., min_length=1)
    ip_address: str = Field(..., min_length=1)
    port: int = Field(554, ge=1, le=65535)
    stream_path: str = Field("/")
    description: Optional[str] = None
    is_active: bool = True
    profile_id: Optional[int] = None
    room_id: Optional[int] = None

    @field_validator("stream_path")
    @classmethod
    def normalize_stream_path(cls, v: str) -> str:
        v = v.strip()
        if not v:
            return "/"
        if not v.startswith("/"):
            v = "/" + v
        return v


class CameraCreate(CameraBase):
    pass


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    stream_path: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    profile_id: Optional[int] = None
    room_id: Optional[int] = None


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    ip_address: str
    port: int
    stream_path: str
    description: Optional[str] = None
    is_active: bool
    profile_id: Optional[int] = None
    room_id: Optional[int] = None
    profile: Optional[ProfileOut] = None
    room: Optional[RoomShortOut] = None
    templates: List[ScheduleTemplateShortOut] = []

    @computed_field
    @property
    def stream_url(self) -> str:
        url = f"rtsp://{self.ip_address}:{self.port}{self.stream_path}"
        if self.profile is not None:
            url = f"rtsp://{self.profile.username}:***@{self.ip_address}:{self.port}{self.stream_path}"
        return url


# ---------- ScheduleTemplate schemas ----------

class ScheduleTemplateBase(BaseModel):
    name: str = Field(..., min_length=1)
    day_of_week: int = Field(..., ge=0, le=6)
    start_time: time
    end_time: time
    is_active: bool = True


class ScheduleTemplateCreate(ScheduleTemplateBase):
    pass


class ScheduleTemplateUpdate(BaseModel):
    name: Optional[str] = None
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    is_active: Optional[bool] = None


class ScheduleTemplateOut(ScheduleTemplateBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class ScheduleTemplateOutWithBindings(ScheduleTemplateOut):
    cameras: List[CameraShortOut] = []


# ---------- ScheduleBinding schemas ----------

class ScheduleBindingBase(BaseModel):
    template_id: int
    camera_id: int


class ScheduleBindingCreate(ScheduleBindingBase):
    pass


class ScheduleBindingOut(ScheduleBindingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template: Optional[ScheduleTemplateShortOut] = None
    camera: Optional[CameraShortOut] = None


# Resolve forward refs
ScheduleTemplateOutWithBindings.model_rebuild()
