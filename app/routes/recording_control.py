from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from typing import List

from app.database import get_db
from app.models import ScheduleBinding, Camera, Room
from app.services.ffmpeg_service import FFmpegService
from app.services.utils import build_recording_path

router = APIRouter(prefix="/api/recordings", tags=["recording_control"])


class ActiveRecordingOut(BaseModel):
    binding_id: int
    camera_id: int | None
    pid: int | None
    output_path: str | None


def _seconds_between(start_time, end_time) -> int:
    today = datetime.today().date()
    start_dt = datetime.combine(today, start_time)
    end_dt = datetime.combine(today, end_time)
    if end_dt < start_dt:
        end_dt += timedelta(days=1)
    return int((end_dt - start_dt).total_seconds())


@router.post("/schedule/{binding_id}/start")
async def start_recording_by_binding(binding_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ScheduleBinding)
        .where(ScheduleBinding.id == binding_id)
        .options(
            selectinload(ScheduleBinding.camera).selectinload(Camera.room).selectinload(Room.address),
            selectinload(ScheduleBinding.camera).selectinload(Camera.profile),
            selectinload(ScheduleBinding.template),
        )
    )
    binding = result.scalar_one_or_none()
    if not binding:
        raise HTTPException(status_code=404, detail="Binding not found")
    camera = binding.camera
    if not camera or not camera.is_active:
        raise HTTPException(status_code=400, detail="Camera is inactive or not found")

    duration = _seconds_between(binding.template.start_time, binding.template.end_time)

    room = getattr(camera, "room", None)
    output_path = build_recording_path(
        camera_id=camera.id,
        camera_name=camera.name,
        profile_name=getattr(camera.profile, "name", None),
        room_name=getattr(room, "name", None) if room else None,
        address_name=getattr(room.address, "name", None) if room and hasattr(room, "address") else None,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    await FFmpegService.start_recording(
        binding_id=binding.id,
        camera_id=camera.id,
        stream_url=camera.stream_url,
        output_path=output_path,
        duration=duration,
    )
    return {
        "ok": True,
        "binding_id": binding_id,
        "camera_id": camera.id,
        "output_path": str(output_path),
        "duration": duration,
    }


@router.post("/schedule/{binding_id}/stop")
async def stop_recording_by_binding(binding_id: int, db: AsyncSession = Depends(get_db)):
    stopped = await FFmpegService.stop_recording(binding_id)
    return {"ok": True, "binding_id": binding_id, "stopped": stopped}


@router.get("/active", response_model=List[ActiveRecordingOut])
async def list_active_recordings():
    return FFmpegService.list_active()