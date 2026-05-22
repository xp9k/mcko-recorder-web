from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, asc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database import get_db
from app.models import ScheduleBinding, ScheduleTemplate, Camera
from app.schemas import ScheduleBindingCreate, ScheduleBindingOut
from app.services.cron_service import add_or_update_cron_entry, remove_cron_entry

router = APIRouter(prefix="/schedule_bindings", tags=["schedule_bindings"])


@router.get("", response_model=List[ScheduleBindingOut])
async def list_schedule_bindings(template_id: int = None, camera_id: int = None, db: AsyncSession = Depends(get_db)):
    query = select(ScheduleBinding).options(selectinload(ScheduleBinding.template), selectinload(ScheduleBinding.camera))
    if template_id is not None:
        query = query.where(ScheduleBinding.template_id == template_id)
    if camera_id is not None:
        query = query.where(ScheduleBinding.camera_id == camera_id)
    query = query.join(ScheduleBinding.template).order_by(asc(ScheduleTemplate.day_of_week), asc(ScheduleTemplate.start_time))
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ScheduleBindingOut, status_code=201)
async def create_schedule_binding(data: ScheduleBindingCreate, db: AsyncSession = Depends(get_db)):
    template = await db.get(ScheduleTemplate, data.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Schedule template not found")
    camera = await db.get(Camera, data.camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    result = await db.execute(
        select(ScheduleBinding).where(
            ScheduleBinding.template_id == data.template_id,
            ScheduleBinding.camera_id == data.camera_id
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Binding already exists")
    binding = ScheduleBinding(**data.model_dump())
    db.add(binding)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Binding already exists")
    # Eagerly load after commit to serialize relationships
    result = await db.execute(
        select(ScheduleBinding)
        .where(ScheduleBinding.id == binding.id)
        .options(selectinload(ScheduleBinding.template), selectinload(ScheduleBinding.camera))
    )
    binding_out = result.scalar_one()
    add_or_update_cron_entry(
        binding_id=binding_out.id,
        day_of_week=template.day_of_week,
        start_time=template.start_time,
    )
    return binding_out


@router.get("/{binding_id}", response_model=ScheduleBindingOut)
async def get_schedule_binding(binding_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ScheduleBinding)
        .where(ScheduleBinding.id == binding_id)
        .options(selectinload(ScheduleBinding.template), selectinload(ScheduleBinding.camera))
    )
    binding = result.scalar_one_or_none()
    if not binding:
        raise HTTPException(status_code=404, detail="Schedule binding not found")
    return binding


@router.delete("/{binding_id}")
async def delete_schedule_binding(binding_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ScheduleBinding)
        .where(ScheduleBinding.id == binding_id)
        .options(selectinload(ScheduleBinding.template))
    )
    binding = result.scalar_one_or_none()
    if not binding:
        raise HTTPException(status_code=404, detail="Schedule binding not found")
    await db.delete(binding)
    await db.commit()
    remove_cron_entry(binding_id)
    return {"ok": True}
