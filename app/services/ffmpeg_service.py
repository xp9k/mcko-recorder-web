import asyncio
import logging
import subprocess
import sys
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)

_IS_WINDOWS = sys.platform == 'win32'


def _build_ffmpeg_cmd(stream_url: str, output_path: Path, duration: Optional[int] = None) -> list:
    cmd = [
        "ffmpeg",
        "-rtsp_transport", "tcp",
        "-stimeout", "5000000",
        "-nostdin",
        "-i", stream_url,
        "-c", "copy",
        "-fflags", "+genpts+discardcorrupt",
        "-f", "matroska",
        "-y",
    ]
    if duration is not None:
        cmd += ["-t", str(duration)]
    cmd += [str(output_path)]
    return cmd


def _create_ffmpeg_process(cmd: list) -> subprocess.Popen:
    kwargs = {
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if _IS_WINDOWS:
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    return subprocess.Popen(cmd, **kwargs)


async def _wait_process(proc: subprocess.Popen, timeout: Optional[float] = None) -> int:
    if timeout is not None:
        return await asyncio.to_thread(proc.wait, timeout)
    return await asyncio.to_thread(proc.wait)


class FFmpegService:
    _processes: Dict[int, subprocess.Popen] = {}
    _tasks: Dict[int, asyncio.Task] = {}
    _paths: Dict[int, Path] = {}
    _camera_ids: Dict[int, int] = {}

    @classmethod
    def is_recording(cls, binding_id: int) -> bool:
        proc = cls._processes.get(binding_id)
        return proc is not None and proc.returncode is None

    @classmethod
    def is_camera_recording(cls, camera_id: int) -> bool:
        return any(
            cid == camera_id and cls._processes.get(bid) is not None and cls._processes[bid].returncode is None
            for bid, cid in cls._camera_ids.items()
        )

    @classmethod
    def get_recording_bindings_for_camera(cls, camera_id: int) -> list[int]:
        return [
            bid for bid, cid in cls._camera_ids.items()
            if cid == camera_id and cls._processes.get(bid) is not None and cls._processes[bid].returncode is None
        ]

    @classmethod
    async def start_recording(
        cls,
        binding_id: int,
        camera_id: int,
        stream_url: str,
        output_path: Path,
        duration: Optional[int] = None,
    ) -> Path:
        if cls.is_recording(binding_id):
            logger.warning("Recording already running for binding %s", binding_id)
            return cls._paths.get(binding_id, output_path)

        cmd = _build_ffmpeg_cmd(stream_url, output_path, duration)
        logger.info("Starting FFmpeg for binding %s (camera %s): %s", binding_id, camera_id, output_path.name)
        proc = await asyncio.to_thread(_create_ffmpeg_process, cmd)
        cls._processes[binding_id] = proc
        cls._paths[binding_id] = output_path
        cls._camera_ids[binding_id] = camera_id
        task = asyncio.create_task(
            cls._monitor_process(binding_id),
            name=f"ffmpeg_monitor_{binding_id}",
        )
        cls._tasks[binding_id] = task
        return output_path

    @classmethod
    async def stop_recording(cls, binding_id: int) -> bool:
        proc = cls._processes.pop(binding_id, None)
        task = cls._tasks.pop(binding_id, None)
        cls._paths.pop(binding_id, None)
        cls._camera_ids.pop(binding_id, None)

        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        if proc is None:
            return False

        if proc.returncode is None:
            logger.info("Stopping FFmpeg for binding %s (SIGTERM)", binding_id)
            try:
                proc.terminate()
                await _wait_process(proc, timeout=10)
            except Exception:
                logger.warning("FFmpeg did not terminate in time, killing binding %s", binding_id)
                proc.kill()
                try:
                    await _wait_process(proc, timeout=5)
                except Exception:
                    pass
        return True

    @classmethod
    async def stop_all(cls) -> None:
        ids = list(cls._processes.keys())
        await asyncio.gather(*(cls.stop_recording(bid) for bid in ids), return_exceptions=True)

    @classmethod
    async def _monitor_process(
        cls,
        binding_id: int,
    ) -> None:
        proc = cls._processes.get(binding_id)
        if not proc:
            return

        try:
            await _wait_process(proc)
        except asyncio.CancelledError:
            return

        logger.info(
            "FFmpeg exited for binding %s with code %s", binding_id, proc.returncode
        )
        cls._processes.pop(binding_id, None)
        cls._tasks.pop(binding_id, None)
        cls._paths.pop(binding_id, None)
        cls._camera_ids.pop(binding_id, None)

    @classmethod
    def list_active(cls) -> list:
        active = []
        for binding_id, proc in cls._processes.items():
            if proc.returncode is None:
                path = cls._paths.get(binding_id)
                camera_id = cls._camera_ids.get(binding_id)
                active.append({
                    "binding_id": binding_id,
                    "camera_id": camera_id,
                    "pid": proc.pid,
                    "output_path": str(path) if path else None,
                })
        return active

    @classmethod
    async def kill_orphan_processes(cls) -> list:
        known_pids = {p.pid for p in cls._processes.values() if p.returncode is None}
        orphans: list[dict] = []

        try:
            import psutil
        except ImportError:
            logger.warning("psutil not installed, skipping orphan process cleanup")
            return orphans

        for proc in psutil.process_iter(["pid", "name", "cmdline"]):
            try:
                if proc.info["name"] is None or "ffmpeg" not in proc.info["name"].lower():
                    continue
                if proc.pid in known_pids:
                    continue
                cmdline = proc.info.get("cmdline") or []
                cmd_str = " ".join(cmdline)
                if "-rtsp_transport" not in cmd_str or "-nostdin" not in cmd_str:
                    continue
                logger.info("Killing orphan ffmpeg process pid=%s: %s", proc.pid, cmd_str[:200])
                proc.terminate()
                orphans.append({"pid": proc.pid, "cmdline": cmd_str})
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        if orphans:
            await asyncio.sleep(3)
            for orphan in orphans:
                try:
                    p = psutil.Process(orphan["pid"])
                    if p.is_running():
                        logger.warning("Orphan pid=%s still alive, killing", orphan["pid"])
                        p.kill()
                except psutil.NoSuchProcess:
                    pass

        return orphans