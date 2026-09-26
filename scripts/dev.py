"""Manage this project's local development processes on macOS and Linux."""

import argparse
import fcntl
import hashlib
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from contextlib import suppress
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RUN_DIR = ROOT / ".run"
SERVICES = {"server": 8000, "client": 5173}
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def process_identity(pid: int) -> str:
    """Read process birth time and command to detect stale or reused PIDs."""
    result = subprocess.run(
        ["ps", "-p", str(pid), "-o", "lstart=", "-o", "command="],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def state_path(service: str) -> Path:
    """Return the state file owned by the named service."""
    return RUN_DIR / f"{service}.json"


def running_state(service: str) -> dict[str, Any] | None:
    """Return state only when the recorded process and process group still match."""
    path = state_path(service)
    if not path.exists():
        return None
    state = json.loads(path.read_text())
    pid = state["pid"]
    if state["identity"] != process_identity(pid):
        return None
    try:
        return state if os.getpgid(pid) == pid else None
    except ProcessLookupError:
        return None


def responds(service: str) -> bool:
    """Check application readiness, including SQLite for the API."""
    suffix = "/api/health" if service == "server" else "/"
    try:
        with HTTP.open(f"http://127.0.0.1:{SERVICES[service]}{suffix}", timeout=1) as response:
            body = response.read()
            if service == "server":
                data = json.loads(body)
                return data.get("service") == "product-admin" and data.get("status") == "ok"
            return b'name="application-name" content="product-admin"' in body
    except (OSError, ValueError, urllib.error.URLError):
        return False


def port_available(port: int) -> bool:
    """Check the listening port without terminating an unrelated process."""
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


def prepare_client() -> None:
    """Install npm dependencies when the lockfile or installation changes."""
    client = ROOT / "client"
    fingerprint = hashlib.sha256(
        (client / "package-lock.json").read_bytes() + (client / "package.json").read_bytes()
    ).hexdigest()
    marker = client / "node_modules" / ".product-admin-lock"
    if marker.exists() and marker.read_text() == fingerprint and (client / "node_modules/vite/bin/vite.js").exists():
        return
    if not shutil.which("npm") or not shutil.which("node"):
        raise RuntimeError("Node.js와 npm을 설치해 주세요.")
    print("클라이언트 의존성을 설치합니다 (npm ci).", flush=True)
    subprocess.run(["npm", "ci", "--no-fund", "--no-audit"], cwd=client, check=True)
    marker.write_text(fingerprint)


def command_for(service: str) -> list[str]:
    """Build a command using the uv-managed interpreter or the installed Vite CLI."""
    if service == "server":
        return [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(SERVICES[service]),
            "--reload",
            "--reload-dir",
            str(ROOT / "server/app"),
        ]
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js를 설치해 주세요.")
    return [node, str(ROOT / "client/node_modules/vite/bin/vite.js")]


def terminate_group(pid: int, process: subprocess.Popen[bytes] | None = None) -> None:
    """Stop a known project process group, allowing graceful shutdown first."""
    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if process is not None:
            process.poll()
        try:
            os.killpg(pid, 0)
        except ProcessLookupError:
            return
        time.sleep(0.1)
    with suppress(ProcessLookupError):
        os.killpg(pid, signal.SIGKILL)


def start_service(service: str) -> subprocess.Popen[bytes] | None:
    """Return a newly started process, or None when the service already runs."""
    if running_state(service):
        if not responds(service):
            raise RuntimeError(f"{service} 프로세스가 응답하지 않습니다. make reload로 재시작해 주세요.")
        print(f"{service}: 이미 실행 중입니다.", flush=True)
        return None
    port = SERVICES[service]
    if not port_available(port):
        raise RuntimeError(f"{port} 포트가 다른 프로세스에 사용 중입니다. 해당 프로세스는 종료하지 않았습니다.")
    if service == "client":
        prepare_client()
    log_path = RUN_DIR / f"{service}.log"
    with log_path.open("ab") as log:
        process = subprocess.Popen(
            command_for(service),
            cwd=ROOT / service,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    try:
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"{service} 실행 실패. 로그: {log_path}")
            if responds(service):
                identity = process_identity(process.pid)
                if not identity:
                    raise RuntimeError(f"{service} 프로세스가 시작 직후 종료되었습니다.")
                state_path(service).write_text(json.dumps({"pid": process.pid, "identity": identity}))
                print(f"{service}: http://127.0.0.1:{port} (PID {process.pid})", flush=True)
                return process
            time.sleep(0.2)
        raise RuntimeError(f"{service} 응답 대기 시간 초과. 로그: {log_path}")
    except BaseException:
        terminate_group(process.pid, process)
        process.wait()
        state_path(service).unlink(missing_ok=True)
        raise


def stop_service(service: str, process: subprocess.Popen[bytes] | None = None) -> None:
    """Stop only a process whose recorded identity belongs to this project."""
    state = running_state(service)
    if state:
        terminate_group(state["pid"], process)
        print(f"{service}: 종료했습니다.", flush=True)
    state_path(service).unlink(missing_ok=True)


def start_services(services: list[str]) -> None:
    """Roll back only newly started services when a multi-service start fails."""
    started = []
    try:
        for service in services:
            process = start_service(service)
            if process is not None:
                started.append((service, process))
    except BaseException:
        for service, process in reversed(started):
            stop_service(service, process)
        raise


def show_status() -> None:
    """Report stopped, healthy, unhealthy, and externally occupied services."""
    for service, port in SERVICES.items():
        state = running_state(service)
        if state:
            health = "정상" if responds(service) else "응답 없음"
            detail = f"실행 중 / {health} / PID {state['pid']}"
        else:
            detail = "중지" if port_available(port) else "미관리 프로세스가 포트 사용 중"
        print(f"{service:6}  {detail}  http://127.0.0.1:{port}")


def main() -> int:
    """Dispatch serialized lifecycle commands from the repository Makefile."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["dev", "server", "status", "reload", "stop"])
    args = parser.parse_args()
    RUN_DIR.mkdir(exist_ok=True)
    try:
        with (RUN_DIR / "control.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if args.command == "status":
                show_status()
            elif args.command == "stop":
                for service in reversed(SERVICES):
                    stop_service(service)
                show_status()
            elif args.command == "reload":
                active = [service for service in SERVICES if running_state(service)]
                if not active:
                    print("실행 중인 서비스가 없습니다. make dev 또는 make server로 시작해 주세요.")
                else:
                    for service in reversed(active):
                        stop_service(service)
                    start_services(active)
            else:
                start_services(list(SERVICES) if args.command == "dev" else ["server"])
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"오류: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
