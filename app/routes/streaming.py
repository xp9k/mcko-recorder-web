import asyncio
import logging
import sys

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Camera

router = APIRouter(prefix="/streaming", tags=["streaming"])
logger = logging.getLogger(__name__)

BOUNDARY = b"frame"
JPEG_START = b"\xff\xd8"
JPEG_END = b"\xff\xd9"
STREAM_TIMEOUT = 300

_IS_WINDOWS = sys.platform == "win32"


async def _read_jpeg_frame(reader: asyncio.StreamReader, timeout: int = 10) -> bytes:
    buf = bytearray()
    while True:
        chunk = await asyncio.wait_for(reader.read(4096), timeout=timeout)
        if not chunk:
            return b""
        buf.extend(chunk)
        if (start := buf.find(JPEG_START)) != -1:
            buf = bytearray(buf[start:])
            break

    while True:
        if (end := buf.find(JPEG_END)) != -1:
            return bytes(buf[: end + len(JPEG_END)])
        chunk = await asyncio.wait_for(reader.read(4096), timeout=timeout)
        if not chunk:
            return b""
        buf.extend(chunk)


async def mjpeg_stream(stream_url: str):
    cmd = [
        "ffmpeg",
        "-rtsp_transport", "tcp",
        "-fflags", "nobuffer",
        "-flags", "low_delay",
        "-i", stream_url,
        "-f", "mjpeg",
        "-q:v", "5",
        "-s", "640x360",
        "-an",
        "pipe:1",
    ]
    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        logger.info("Started MJPEG stream for %s (pid %s)", stream_url, proc.pid)

        start = asyncio.get_event_loop().time()
        while True:
            elapsed = int(asyncio.get_event_loop().time() - start)
            if elapsed >= STREAM_TIMEOUT:
                logger.info("MJPEG stream timeout (pid %s, %ds), stopping", proc.pid, elapsed)
                break

            try:
                frame = await _read_jpeg_frame(proc.stdout, timeout=15)
            except asyncio.TimeoutError:
                stderr_data = await proc.stderr.read(4096) if proc.stderr else b''
                logger.warning("MJPEG frame read timeout (pid %s), stderr: %s", proc.pid, stderr_data[:500].decode('utf-8', errors='replace'))
                break

            if not frame:
                break
            yield (
                b"--" + BOUNDARY + b"\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(frame)).encode() + b"\r\n"
                b"\r\n"
                + frame
                + b"\r\n"
            )
    except asyncio.CancelledError:
        logger.info("MJPEG stream cancelled (pid %s)", proc.pid if proc else "?")
        raise
    finally:
        if proc is not None:
            try:
                if proc.returncode is None:
                    proc.kill()
                    await proc.wait()
                stderr = await proc.stderr.read()
                if stderr:
                    decoded = stderr.decode('utf-8', errors='replace')
                    logger.error("FFmpeg stderr (pid %s, rc=%s): ...%s", proc.pid, proc.returncode, decoded[-2000:])
                logger.info("MJPEG stream stopped (pid %s, rc=%s)", proc.pid, proc.returncode)
            except OSError:
                pass


@router.get("/{camera_id}/live")
async def live_stream(camera_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Camera).where(Camera.id == camera_id).options(selectinload(Camera.profile))
    )
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not camera.is_active:
        raise HTTPException(status_code=400, detail="Camera is inactive")

    if _IS_WINDOWS:
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            proc.kill()
            await proc.wait()
        except NotImplementedError:
            raise HTTPException(
                status_code=501,
                detail="Прямая трансляция недоступна на Windows. Требуется ProactorEventLoop — запустите: uvicorn main:app --loop asyncio",
            )

    return StreamingResponse(
        mjpeg_stream(camera.stream_url),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )