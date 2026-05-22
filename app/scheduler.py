import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import async_session
from app.models import ScheduleTemplate, ScheduleBinding, Camera, Room
from app.services.ffmpeg_service import FFmpegService
from app.services.cron_service import full_sync_cron_entries, find_anomalies
from app.services.utils import build_recording_path

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def check_schedules():
    now = datetime.now()
    current_dow = now.weekday()
    current_time = now.time()

    async with async_session() as session:
        bindings_result = await session.execute(
            select(ScheduleBinding)
            .options(
                selectinload(ScheduleBinding.template),
                selectinload(ScheduleBinding.camera).selectinload(Camera.profile),
                selectinload(ScheduleBinding.camera).selectinload(Camera.room).selectinload(Room.address),
            )
            .join(ScheduleBinding.template)
            .join(ScheduleBinding.camera)
            .where(
                and_(
                    ScheduleTemplate.is_active == True,
                    Camera.is_active == True,
                    ScheduleTemplate.day_of_week == current_dow,
                )
            )
        )
        all_bindings = bindings_result.scalars().all()

        active_binding_ids = set()
        for binding in all_bindings:
            tpl = binding.template
            if tpl.start_time <= current_time and tpl.end_time >= current_time:
                active_binding_ids.add(binding.id)

        for binding in all_bindings:
            should_record = binding.id in active_binding_ids
            is_recording = FFmpegService.is_recording(binding.id)

            if should_record and not is_recording:
                logger.info("Schedule triggered start for binding %s (camera %s)", binding.id, binding.camera_id)
                tpl = binding.template
                end_dt = datetime.combine(now.date(), tpl.end_time)
                if end_dt < now:
                    end_dt += timedelta(days=1)
                duration = int((end_dt - now).total_seconds())
                camera = binding.camera
                output_path = build_recording_path(
                    camera_id=camera.id,
                    camera_name=camera.name,
                    profile_name=getattr(camera.profile, "name", None),
                    room_name=getattr(camera.room, "name", None) if camera.room else None,
                    address_name=getattr(camera.room.address, "name", None) if camera.room and camera.room.address else None,
                )
                output_path.parent.mkdir(parents=True, exist_ok=True)
                await FFmpegService.start_recording(
                    binding_id=binding.id,
                    camera_id=camera.id,
                    stream_url=camera.stream_url,
                    output_path=output_path,
                    duration=duration,
                )
            elif not should_record and is_recording:
                logger.info("Schedule triggered stop for binding %s (camera %s)", binding.id, binding.camera_id)
                await FFmpegService.stop_recording(binding.id)


async def sync_cron_with_database():
    async with async_session() as session:
        result = await session.execute(
            select(ScheduleBinding)
            .options(selectinload(ScheduleBinding.template))
        )
        bindings = result.scalars().all()
        full_sync_cron_entries(bindings)


async def check_cron_anomalies():
    async with async_session() as session:
        result = await session.execute(
            select(ScheduleBinding)
            .options(selectinload(ScheduleBinding.template), selectinload(ScheduleBinding.camera))
        )
        bindings = result.scalars().all()
        anomalies = find_anomalies(bindings)
        if anomalies:
            logger.warning("Cron anomalies detected: %s", anomalies)
        return anomalies


def setup_scheduler():
    scheduler.add_job(
        check_schedules,
        trigger=CronTrigger(minute="*"),
        id="schedule_checker",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started")


async def shutdown_scheduler():
    await FFmpegService.stop_all()
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")