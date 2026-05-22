import os
import stat
import shutil
from pathlib import Path
from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from app.config import RECORDINGS_DIR

router = APIRouter(prefix="/recordings", tags=["recordings"])


class RecordingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    filename: str
    size: int
    created_at: float
    camera_id: int | None = None


def _parse_camera_id(filename: str) -> int | None:
    # Формат имён: camera_{id}_{datetime}.mkv
    stem = Path(filename).stem
    parts = stem.split("_")
    if len(parts) >= 2 and parts[0] == "camera":
        try:
            return int(parts[1])
        except ValueError:
            pass
    return None


def _scan_recordings(root: Path, prefix: str = "") -> List[RecordingOut]:
    files: List[RecordingOut] = []
    if not root.exists():
        return files
    for entry in root.iterdir():
        rel = f"{prefix}/{entry.name}" if prefix else entry.name
        if entry.is_dir():
            files.extend(_scan_recordings(entry, rel))
        elif entry.is_file() and entry.suffix.lower() in (".mkv", ".mp4"):
            stat = entry.stat()
            files.append(
                RecordingOut(
                    filename=rel,
                    size=stat.st_size,
                    created_at=stat.st_ctime,
                    camera_id=_parse_camera_id(entry.name),
                )
            )
    return files


@router.get("", response_model=List[RecordingOut])
async def list_recordings():
    files = _scan_recordings(RECORDINGS_DIR)
    files.sort(key=lambda x: x.created_at, reverse=True)
    return files


@router.delete("/folder/{filepath:path}")
async def delete_recording_folder(filepath: str):
    dir_path = RECORDINGS_DIR / filepath
    try:
        dir_path = dir_path.resolve()
        if not str(dir_path).startswith(str(RECORDINGS_DIR.resolve())):
            raise HTTPException(status_code=400, detail="Invalid path")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    RECORDINGS_DIR_resolve = RECORDINGS_DIR.resolve()
    if dir_path == RECORDINGS_DIR_resolve or dir_path == RECORDINGS_DIR:
        raise HTTPException(status_code=400, detail="Cannot delete root recordings folder")

    if not dir_path.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")

    for item in dir_path.rglob("*"):
        if item.is_file() and item.suffix.lower() not in (".mkv", ".mp4"):
            raise HTTPException(status_code=400, detail="Folder contains non-video files")

    from app.services.ffmpeg_service import FFmpegService
    active_paths = {str(p.resolve()) for p in FFmpegService._paths.values() if p}
    for item in dir_path.rglob("*"):
        if item.is_file() and str(item.resolve()) in active_paths:
            raise HTTPException(status_code=409, detail="Folder contains active recordings")

    errors = []

    def _on_rmtree_error(func, path, exc_info):
        exc = exc_info[1]
        if isinstance(exc, PermissionError) and func in (os.unlink, os.rmdir):
            try:
                os.chmod(path, stat.S_IWRITE)
                func(path)
            except OSError:
                errors.append(str(path))

    shutil.rmtree(dir_path, onerror=_on_rmtree_error)
    if errors:
        raise HTTPException(status_code=409, detail="Some files are locked by another process and could not be deleted")
    return {"detail": "Folder deleted"}


@router.get("/{filepath:path}")
async def download_recording(filepath: str):
    file_path = RECORDINGS_DIR / filepath
    try:
        file_path = file_path.resolve()
        if not str(file_path).startswith(str(RECORDINGS_DIR.resolve())):
            raise HTTPException(status_code=400, detail="Invalid filepath")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid filepath")

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="video/x-matroska",
    )


@router.delete("/{filepath:path}")
async def delete_recording(filepath: str):
    file_path = RECORDINGS_DIR / filepath
    try:
        file_path = file_path.resolve()
        if not str(file_path).startswith(str(RECORDINGS_DIR.resolve())):
            raise HTTPException(status_code=400, detail="Invalid filepath")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid filepath")

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    file_path.unlink()
    return {"detail": "Deleted"}
