import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./scheduler.db")
RECORDINGS_DIR = Path(os.getenv("RECORDINGS_DIR", "./recordings"))
CRON_FILE_PATH = Path(os.getenv("CRON_FILE_PATH", "/etc/cron.d/mcko-recordings"))

RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)

