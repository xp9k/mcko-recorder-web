from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, asc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database import get_db
from app.models import ScheduleTemplate, ScheduleBinding
from app.schemas import ScheduleTemplateCreate, ScheduleTemplateUpdate, ScheduleTemplateOut, ScheduleTemplateOutWithBindings, CameraShortOut
from app.services.cron_service import add_or_update_cron_entry, remove_cron_entry, full_sync_cron_entries

router = APIRouter(prefix="/schedule_templates", tags=["schedule_templates"])


@router.get("", response_model=List[ScheduleTemplateOut])
async def list_schedule_templates(active_only: bool = False, db: AsyncSession = Depends(get_db)):
    query = select(ScheduleTemplate).order_by(asc(ScheduleTemplate.day_of_week), asc(ScheduleTemplate.start_time))
    if active_only:
        query = query.where(ScheduleTemplate.is_active == True)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ScheduleTemplateOut, status_code=201)
async def create_schedule_template(data: ScheduleTemplateCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(ScheduleTemplate).where(
            ScheduleTemplate.day_of_week == data.day_of_week,
            ScheduleTemplate.start_time == data.start_time,
            ScheduleTemplate.end_time == data.end_time,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Schedule template for this day and time range already exists")
    template = ScheduleTemplate(**data.model_dump())
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.get("/{template_id}", response_model=ScheduleTemplateOutWithBindings)
async def get_schedule_template(template_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ScheduleTemplate)
        .where(ScheduleTemplate.id == template_id)
        .options(selectinload(ScheduleTemplate.bindings).selectinload(ScheduleBinding.camera))
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Schedule template not found")
    cameras = [binding.camera for binding in template.bindings if binding.camera]
    out = ScheduleTemplateOutWithBindings.model_validate(template)
    out.cameras = [CameraShortOut.model_validate(c) for c in cameras]
    return out


@router.patch("/{template_id}", response_model=ScheduleTemplateOut)
async def update_schedule_template(
    template_id: int, data: ScheduleTemplateUpdate, db: AsyncSession = Depends(get_db)
):
    template = await db.get(ScheduleTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Schedule template not found")
    updates = data.model_dump(exclude_unset=True)
    new_dow = updates.get("day_of_week", template.day_of_week)
    new_start = updates.get("start_time", template.start_time)
    new_end = updates.get("end_time", template.end_time)
    if new_dow != template.day_of_week or new_start != template.start_time or new_end != template.end_time:
        existing = await db.execute(
            select(ScheduleTemplate).where(
                ScheduleTemplate.day_of_week == new_dow,
                ScheduleTemplate.start_time == new_start,
                ScheduleTemplate.end_time == new_end,
                ScheduleTemplate.id != template_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Schedule template for this day and time range already exists")
    for field, value in updates.items():
        setattr(template, field, value)
    await db.commit()
    await db.refresh(template)
    bindings_result = await db.execute(
        select(ScheduleBinding)
        .where(ScheduleBinding.template_id == template_id)
    )
    bindings = list(bindings_result.scalars().all())
    for binding in bindings:
        binding.template = template
    full_sync_cron_entries(bindings)
    return template


@router.delete("/{template_id}")
async def delete_schedule_template(template_id: int, db: AsyncSession = Depends(get_db)):
    bindings_result = await db.execute(
        select(ScheduleBinding.id).where(ScheduleBinding.template_id == template_id)
    )
    binding_ids = [row[0] for row in bindings_result.all()]
    for bid in binding_ids:
        remove_cron_entry(bid)
    template = await db.get(ScheduleTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Schedule template not found")
    await db.delete(template)
    await db.commit()
    return {"ok": True}
