"""Minimal Meshy API client: create a task, poll it, download the result.

Copy this file into your own project. Needs `requests` and `python-dotenv`.
"""

from __future__ import annotations

import base64
import os
import tempfile
import time
from pathlib import Path

import requests
from dotenv import find_dotenv, load_dotenv

BASE_URL = "https://api.meshy.ai/openapi"
VERSIONS = {"text-to-3d": "v2"}  # every other endpoint is served under v1
POLL_SECONDS = 5


class MeshyAPIError(Exception):
    """Non-2xx response from the Meshy API. Carries `status` and `body`."""

    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"Meshy API returned {status}: {body}")
        self.status = status
        self.body = body


class MeshyTaskError(Exception):
    """Task ended FAILED or CANCELED. Carries the task and `task_error.message`."""

    def __init__(self, task: dict) -> None:
        self.task = task
        self.message = (task.get("task_error") or {}).get("message") or task["status"]
        super().__init__(f"Task {task['id']} {task['status']}: {self.message}")


class MeshyTimeoutError(TimeoutError):
    """Task still PENDING or IN_PROGRESS when `wait` hit its timeout. Carries the task."""

    def __init__(self, task: dict, timeout: float) -> None:
        self.task = task
        super().__init__(
            f"Task {task['id']} still {task['status']} after {timeout:.0f} s"
        )


class Meshy:
    """Thin client over POST /<endpoint>, GET /<endpoint>/:id, and result downloads."""

    def __init__(
        self, api_key: str | None = None, env_file: Path | None = None
    ) -> None:
        """Use `api_key`, or MESHY_API_KEY from the environment or the nearest .env."""
        load_dotenv(env_file if env_file is not None else find_dotenv(usecwd=True))
        self.api_key = api_key or os.environ.get("MESHY_API_KEY", "")
        if not self.api_key:
            raise RuntimeError(
                "MESHY_API_KEY is not set. Copy .env.example to .env and paste your key."
            )
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {self.api_key}"

    @staticmethod
    def url(endpoint: str) -> str:
        """The endpoint's URL: text-to-3d is under /openapi/v2, everything else under /openapi/v1."""
        return f"{BASE_URL}/{VERSIONS.get(endpoint, 'v1')}/{endpoint}"

    def create(self, endpoint: str, payload: dict) -> str:
        """POST `payload` to /<endpoint>; print and return the task id. Retries 429 three times."""
        # A slow answer still creates a paid task, so wait long before giving up.
        post = lambda: self.session.post(self.url(endpoint), json=payload, timeout=180)
        response = post()
        for attempt in range(3):
            if response.status_code != 429:
                break
            time.sleep(2**attempt)
            response = post()
        if not response.ok:
            raise MeshyAPIError(response.status_code, response.text)
        task_id = response.json()["result"]
        print(f"Created {endpoint} task {task_id}", flush=True)
        return task_id

    def get(self, endpoint: str, task_id: str) -> dict:
        """GET /<endpoint>/<task_id> and return the task object."""
        response = self.session.get(f"{self.url(endpoint)}/{task_id}", timeout=60)
        if not response.ok:
            raise MeshyAPIError(response.status_code, response.text)
        return response.json()

    def wait(
        self, endpoint: str, task_id: str, label: str = "", timeout: float = 1800
    ) -> dict:
        """Poll every 5 s, printing progress (prefixed by `label`), until SUCCEEDED.

        A network error, 429, or 5xx while polling is retried three times, so a blip
        mid-generation does not lose the task. Raises on FAILED/CANCELED/timeout.
        """
        deadline = time.monotonic() + timeout
        prefix = f"{label} " if label else ""
        last = ""
        failures = 0
        while True:
            try:
                task = self.get(endpoint, task_id)
                failures = 0
            except (requests.RequestException, MeshyAPIError) as error:
                transient = (
                    isinstance(error, requests.RequestException)
                    or error.status == 429
                    or error.status >= 500
                )
                failures += 1
                if not transient or failures > 3:
                    raise
                print(
                    f"  {prefix}poll failed, retrying ({type(error).__name__})",
                    flush=True,
                )
                time.sleep(POLL_SECONDS)
                continue
            state = f"  {prefix}{task['status']:<11} {task.get('progress', 0):>3}%"
            if state != last:
                print(state, flush=True)
                last = state
            if task["status"] == "SUCCEEDED":
                return task
            if task["status"] in ("FAILED", "CANCELED"):
                raise MeshyTaskError(task)
            if time.monotonic() >= deadline:
                raise MeshyTimeoutError(task, timeout)
            time.sleep(POLL_SECONDS)

    def download(self, url: str, dest: Path) -> Path:
        """Stream to a temporary file, then replace `dest` only after success."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            # Signed URL: no auth header.
            with requests.get(url, stream=True, timeout=120) as response:
                if not response.ok:
                    raise MeshyAPIError(response.status_code, response.text)
                with tempfile.NamedTemporaryFile(dir=dest.parent, delete=False) as f:
                    temporary = Path(f.name)
                    for chunk in response.iter_content(chunk_size=1 << 16):
                        f.write(chunk)
                temporary.replace(dest)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        return dest

    @staticmethod
    def data_uri(path: Path) -> str:
        """Encode a local .png/.jpg as a base64 data URI for `image_url` fields."""
        mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(path.suffix.lower())
        if mime is None:
            raise ValueError(f"Input must be a PNG or JPEG file: {path}")
        if not path.is_file():
            raise ValueError(f"Input file does not exist: {path}")
        return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"
