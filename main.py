import asyncio
import logging
import sys


logging.basicConfig(
    level=logging.ERROR,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.database import engine, Base
from app.scheduler import setup_scheduler, shutdown_scheduler, sync_cron_with_database, check_cron_anomalies, check_schedules
from app.services.ffmpeg_service import FFmpegService

logger = logging.getLogger(__name__)
from app.routes import cameras, streaming, recordings, profiles, addresses, rooms, schedule_templates, schedule_bindings, recording_control


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    orphans = await FFmpegService.kill_orphan_processes()
    if orphans:
        logger.info("Killed %d orphan ffmpeg processes on startup", len(orphans))
    try:
        await sync_cron_with_database()
        anomalies = await check_cron_anomalies()
        app.state.cron_anomalies = anomalies
    except Exception as e:
        logger.warning("Cron sync failed (may be missing permissions): %s", e)
    setup_scheduler()
    await check_schedules()
    yield
    # Shutdown
    await shutdown_scheduler()


app = FastAPI(title="RTSP Camera Scheduler", lifespan=lifespan)

app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(addresses.router)
app.include_router(rooms.router)
app.include_router(profiles.router)
app.include_router(cameras.router)
app.include_router(schedule_templates.router)
app.include_router(schedule_bindings.router)
app.include_router(streaming.router)
app.include_router(recordings.router)
app.include_router(recording_control.router)


@app.get("/")
async def root():
    return FileResponse("app/static/index.html")


@app.get("/cron_anomalies")
async def get_cron_anomalies():
    anomalies = await check_cron_anomalies()
    return {"anomalies": anomalies}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, loop="asyncio")
