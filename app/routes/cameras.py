from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Camera, Room, ScheduleBinding
from app.schemas import CameraCreate, CameraUpdate, CameraOut
from app.services.ffmpeg_service import FFmpegService
from app.services.cron_service import remove_cron_entries_by_binding_ids
from app.services.utils import build_recording_path

_MANUAL_BINDING_ID_OFFSET = -1000

router = APIRouter(prefix="/cameras", tags=["cameras"])


# Загружаем room + address + room.cameras (для RoomShortOut) + profile + bindings with templates
camera_options = [
    selectinload(Camera.profile),
    selectinload(Camera.room).selectinload(Room.address),
    selectinload(Camera.room).selectinload(Room.cameras),
    selectinload(Camera.bindings).selectinload(ScheduleBinding.template),
]


@router.get("", response_model=List[CameraOut])
async def list_cameras(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Camera).options(*camera_options))
    return result.scalars().all()


@router.post("", response_model=CameraOut, status_code=201)
async def create_camera(data: CameraCreate, db: AsyncSession = Depends(get_db)):
    ip = data.ip_address
    port = data.port if data.port is not None else 554
    path = data.stream_path if data.stream_path is not None else "/stream"
    existing = await db.execute(
        select(Camera).where(
            Camera.ip_address == ip,
            Camera.port == port,
            Camera.stream_path == path,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Camera with this IP/port/stream already exists")
    camera = Camera(**data.model_dump(exclude_unset=True))
    db.add(camera)
    await db.commit()
    result = await db.execute(
        select(Camera).where(Camera.id == camera.id).options(*camera_options)
    )
    return result.scalar_one()


@router.get("/{camera_id}", response_model=CameraOut)
async def get_camera(camera_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Camera)
        .where(Camera.id == camera_id)
        .options(*camera_options)
    )
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera


@router.patch("/{camera_id}", response_model=CameraOut)
async def update_camera(
    camera_id: int, data: CameraUpdate, db: AsyncSession = Depends(get_db)
):
    camera = await db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    updates = data.model_dump(exclude_unset=True)
    new_ip = updates.get("ip_address", camera.ip_address)
    new_port = updates.get("port", camera.port)
    new_path = updates.get("stream_path", camera.stream_path)
    if new_ip != camera.ip_address or new_port != camera.port or new_path != camera.stream_path:
        existing = await db.execute(
            select(Camera).where(
                Camera.ip_address == new_ip,
                Camera.port == new_port,
                Camera.stream_path == new_path,
                Camera.id != camera_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Camera with this IP/port/stream already exists")
    for field, value in updates.items():
        setattr(camera, field, value)
    await db.commit()
    result = await db.execute(
        select(Camera).where(Camera.id == camera_id).options(*camera_options)
    )
    return result.scalar_one()


@router.delete("/{camera_id}")
async def delete_camera(camera_id: int, db: AsyncSession = Depends(get_db)):
    camera = await db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    bindings_result = await db.execute(
        select(ScheduleBinding.id).where(ScheduleBinding.camera_id == camera_id)
    )
    binding_ids = {row[0] for row in bindings_result.all()}
    if binding_ids:
        remove_cron_entries_by_binding_ids(binding_ids)
    for bid in FFmpegService.get_recording_bindings_for_camera(camera_id):
        await FFmpegService.stop_recording(bid)
    manual_bid = _MANUAL_BINDING_ID_OFFSET - camera_id
    if FFmpegService.is_recording(manual_bid):
        await FFmpegService.stop_recording(manual_bid)
    await db.delete(camera)
    await db.commit()
    return {"ok": True}


@router.post("/{camera_id}/record")
async def start_manual_recording(camera_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Camera)
        .where(Camera.id == camera_id)
        .options(selectinload(Camera.profile), selectinload(Camera.room).selectinload(Room.address))
    )
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not camera.is_active:
        raise HTTPException(status_code=400, detail="Camera is inactive")

    binding_id = _MANUAL_BINDING_ID_OFFSET - camera_id
    if FFmpegService.is_recording(binding_id):
        raise HTTPException(status_code=409, detail="Manual recording already running for this camera")

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
        binding_id=binding_id,
        camera_id=camera.id,
        stream_url=camera.stream_url,
        output_path=output_path,
    )
    return {"ok": True, "output_path": str(output_path)}


@router.post("/{camera_id}/stop")
async def stop_manual_recording(camera_id: int, db: AsyncSession = Depends(get_db)):
    binding_id = _MANUAL_BINDING_ID_OFFSET - camera_id
    stopped = await FFmpegService.stop_recording(binding_id)
    return {"ok": True, "stopped": stopped}
