import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.config import RECORDINGS_DIR


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/*?:"<>|\s]', "_", name).strip()


def build_recording_path(
    camera_id: int,
    camera_name: Optional[str] = None,
    profile_name: Optional[str] = None,
    room_name: Optional[str] = None,
    address_name: Optional[str] = None,
    base_dir: Optional[Path] = None,
) -> Path:
    now = datetime.now()
    date_part = f"{now.year}/{now.month:02d}/{now.day:02d}"
    address = sanitize_filename(address_name) if address_name else "NOADDRESS"
    room = sanitize_filename(room_name) if room_name else "NOROOM"
    cam = sanitize_filename(camera_name) if camera_name else f"cam{camera_id}"
    school = sanitize_filename(profile_name) if profile_name else f"cam{camera_id}"
    ts = now.strftime("%H.%M")
    dir_part = f"{date_part}/{address}/{room}/{cam}"
    name_part = f"{school}_{room}_{ts}.mkv"
    return (base_dir or RECORDINGS_DIR) / dir_part / name_part