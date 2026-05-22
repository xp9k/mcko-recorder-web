"""
Cron-файл для системного crond (/etc/cron.d/mcko-recording).
Одна строка = одна ScheduleBinding.
Формат:
  MM HH * * dow  curl -fsS -X POST "http://127.0.0.1:8000/api/recordings/schedule/{binding_id}/start"
"""
import logging
import os
import re
import stat
from datetime import time
from typing import Any, List, Tuple

from app.config import CRON_FILE_PATH

logger = logging.getLogger(__name__)

API_BASE_URL = os.getenv("CRON_API_BASE_URL", "http://127.0.0.1:8000")
API_RECORD_PATH = "/api/recordings/schedule"

CURL_CMD = "curl -fsS -X POST"

DEFAULT_HEADER = (
    "# MCKO Recording Scheduler\n"
    "# minute hour * * day_of_week  command\n"
)

_DB_TO_CRON = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0}


def _build_line(hour: int, minute: int, day_of_week: int, binding_id: int) -> str:
    cron_dow = _DB_TO_CRON.get(day_of_week, day_of_week)
    url = f"{API_BASE_URL}{API_RECORD_PATH}/{binding_id}/start"
    return f"{minute:02d} {hour:02d} * * {cron_dow}  {CURL_CMD} \"{url}\""


def _read_lines() -> List[str]:
    if not CRON_FILE_PATH.exists():
        return []
    lines: List[str] = []
    try:
        with open(CRON_FILE_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                lines.append(line)
    except Exception as e:
        logger.warning("Failed to read cron file: %s", e)
    return lines


def _write_lines(lines: List[str]) -> None:
    try:
        with open(CRON_FILE_PATH, "w", encoding="utf-8") as f:
            f.write(DEFAULT_HEADER)
            for line in lines:
                f.write(line + "\n")
        try:
            os.chmod(CRON_FILE_PATH, stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass
        logger.info("Cron file updated: %s entries", len(lines))
    except Exception as e:
        logger.error("Failed to write cron file: %s", e)


def _extract_binding_id(line: str) -> int | None:
    match = re.search(rf"{re.escape(API_RECORD_PATH)}/(\d+)/start", line)
    if match:
        return int(match.group(1))
    return None


def add_or_update_cron_entry(
    binding_id: int,
    day_of_week: int,
    start_time: time,
    **kwargs,
) -> None:
    lines = _read_lines()
    updated = False
    new_line = _build_line(start_time.hour, start_time.minute, day_of_week, binding_id)
    for i, line in enumerate(lines):
        if _extract_binding_id(line) == binding_id:
            lines[i] = new_line
            updated = True
            break
    if not updated:
        lines.append(new_line)
    _write_lines(lines)


def remove_cron_entry(binding_id: int) -> None:
    lines = _read_lines()
    original_len = len(lines)
    lines = [line for line in lines if _extract_binding_id(line) != binding_id]
    if len(lines) != original_len:
        _write_lines(lines)


def full_sync_cron_entries(bindings_with_templates: List[Any]) -> None:
    lines: List[str] = []
    for b in bindings_with_templates:
        tpl = getattr(b, "template", None)
        if tpl is None or not getattr(tpl, "is_active", True):
            continue
        st = getattr(tpl, "start_time", None)
        dow = getattr(tpl, "day_of_week", None)
        if st is None or dow is None:
            continue
        bid = getattr(b, "id", None)
        if bid is None:
            continue
        lines.append(_build_line(st.hour, st.minute, dow, bid))
    _write_lines(lines)


def parse_cron_line(line: str) -> Tuple[int, int, int, int] | None:
    parts = line.split()
    if len(parts) < 7:
        return None
    try:
        minute = int(parts[0])
        hour = int(parts[1])
        cron_dow = int(parts[4])
        bid = _extract_binding_id(line)
        if bid is None:
            return None
        return (minute, hour, cron_dow, bid)
    except (ValueError, IndexError):
        return None


def find_anomalies(db_bindings: List[Any]) -> List[str]:
    cron_lines = _read_lines()
    anomalies: List[str] = []

    eligible_ids: set[int | None] = set()
    for b in db_bindings:
        tpl = getattr(b, "template", None)
        if tpl is None or not getattr(tpl, "is_active", True):
            continue
        if getattr(tpl, "start_time", None) is None or getattr(tpl, "day_of_week", None) is None:
            continue
        eligible_ids.add(getattr(b, "id", None))

    db_ids = {getattr(b, "id", None) for b in db_bindings}
    cron_ids = set()
    cron_data: dict[int, Tuple[int, int, int]] = {}

    for line in cron_lines:
        parsed = parse_cron_line(line)
        if parsed:
            minute, hour, cron_dow, bid = parsed
            cron_ids.add(bid)
            cron_data[bid] = (minute, hour, cron_dow)

    missing = eligible_ids - cron_ids - {None}
    extra = cron_ids - db_ids

    if missing:
        for bid in missing:
            b = next((x for x in db_bindings if getattr(x, "id", None) == bid), None)
            cam_id = getattr(getattr(b, "camera", None), "id", "?") if b else "?"
            anomalies.append(f"Binding ID={bid} (camera={cam_id}) in DB but missing in cron")

    if extra:
        for bid in extra:
            anomalies.append(f"Entry ID={bid} in cron but binding missing in DB")

    for b in db_bindings:
        bid = getattr(b, "id", None)
        tpl = getattr(b, "template", None)
        if bid is None or tpl is None:
            continue
        entry = cron_data.get(bid)
        if entry is None:
            continue
        minute, hour, cron_dow = entry
        db_dow = _DB_TO_CRON.get(getattr(tpl, "day_of_week", 0))
        st = getattr(tpl, "start_time", None)
        if db_dow is not None and cron_dow != db_dow:
            anomalies.append(f"Dow mismatch binding ID={bid} (cron={cron_dow} vs db={db_dow})")
        if st is not None and (minute != st.minute or hour != st.hour):
            anomalies.append(f"Time mismatch binding ID={bid} (cron={hour:02d}:{minute:02d} vs db={st.strftime('%H:%M')})")

    return anomalies


def remove_cron_entries_by_binding_ids(binding_ids: set) -> None:
    lines = _read_lines()
    original_len = len(lines)
    lines = [line for line in lines if _extract_binding_id(line) not in binding_ids]
    if len(lines) != original_len:
        _write_lines(lines)