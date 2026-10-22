"""Pre-run check of the local stack: is everything a live run needs up, and what to do if not.

Spec: infra/specs/local-development.md §5. Standard library only, so any Python 3 runs it:

    python infra/local/check_stack.py            # settings from the environment (infra/local/env.example)
    python infra/local/check_stack.py --model    # also one short call to the configured local model

Checks: the three emulators (Cosmos, Event Hubs, Azurite), the Web PubSub stand-in, and — when
OVERLAP_MODEL_PROVIDER=local — that Foundry Local answers at OVERLAP_LOCAL_MODEL_URL (its port changes when the
server restarts, e.g. after the laptop sleeps). Prints one line per check and exits 1 if anything is down.
Never prints a key.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

OK, FAIL, SKIP = "ok  ", "FAIL", "skip"


def port_open(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def http_get(url: str, timeout: float = 3.0) -> tuple[int | None, str]:
    context = ssl._create_unverified_context() if url.startswith("https://127.0.0.1") else None  # emulator cert
    try:
        with urllib.request.urlopen(url, timeout=timeout, context=context) as r:
            return r.status, r.read(2000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except (urllib.error.URLError, OSError, TimeoutError):
        return None, ""


def foundry_url() -> str | None:
    """The URL Foundry Local reports now (`foundry server status`), or None if the CLI isn't there."""
    try:
        out = subprocess.run(["foundry", "server", "status"], check=False, capture_output=True, text=True,
                             timeout=20).stdout
    except (OSError, subprocess.TimeoutExpired):
        return None
    for word in out.replace("\x1b", " ").split():
        if word.startswith(("http://127.0.0.1:", "http://localhost:")):
            return word.rstrip("/")
    return None


def model_call(base: str, model: str, timeout: float) -> tuple[bool, str]:
    body = json.dumps({"model": model, "messages": [{"role": "user", "content": "Reply with: ready"}],
                       "max_tokens": 5}).encode()
    req = urllib.request.Request(f"{base}/chat/completions", data=body,
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer local"})
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status == 200, f"answered in {time.monotonic() - start:.1f} s"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except (urllib.error.URLError, OSError, TimeoutError) as e:
        return False, type(e).__name__


def checks(with_model: bool) -> list[tuple[str, str, str]]:
    env = os.environ
    rows: list[tuple[str, str, str]] = []

    cosmos = urlsplit(env.get("OVERLAP_COSMOS_ENDPOINT", "http://127.0.0.1:8081"))
    up = port_open(cosmos.hostname or "127.0.0.1", cosmos.port or 8081)
    rows.append(("Cosmos emulator", OK if up else FAIL, f"{cosmos.hostname}:{cosmos.port}" if up else
                 "not reachable: docker compose up -d in infra/local (if it won't start: "
                 "docker compose up -d --force-recreate cosmos, which clears its data)"))

    up = port_open("127.0.0.1", 5672)
    rows.append(("Event Hubs emulator", OK if up else FAIL, "AMQP 5672" if up else
                 "not reachable: docker compose up -d in infra/local"))

    up = port_open("127.0.0.1", 10000)
    rows.append(("Azurite", OK if up else FAIL, "blob 10000" if up else "not reachable: docker compose up -d"))

    standin = env.get("OVERLAP_WEBPUBSUB_ENDPOINT", "http://localhost:8787").rstrip("/")
    status, body = http_get(f"{standin}/health")
    rows.append(("Web PubSub stand-in", OK if status == 200 else FAIL,
                 body.strip()[:80] if status == 200 else "not running: uv run standin in infra/local/webpubsub_standin"))

    provider = env.get("OVERLAP_MODEL_PROVIDER", "off")
    if provider != "local":
        rows.append(("Local model", SKIP, f"provider is {provider}"))
        return rows
    configured = env.get("OVERLAP_LOCAL_MODEL_URL", "").rstrip("/")
    current = foundry_url()
    if current is None:
        rows.append(("Foundry Local", FAIL, "no answer from `foundry server status`: foundry server start"))
        return rows
    same = configured.startswith(current)
    rows.append(("Foundry Local", OK if same else FAIL, f"{current}" if same else
                 f"server is on {current} but OVERLAP_LOCAL_MODEL_URL says {configured or '(unset)'}: update it"))
    if with_model and same:
        ok, detail = model_call(configured, env.get("OVERLAP_LOCAL_MODEL", ""), timeout=60)
        rows.append(("Model call", OK if ok else FAIL, detail if ok else
                     f"{detail}: foundry model unload phi-4-mini, then load it again (or foundry server stop/start)"))
    return rows


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="check_stack")
    ap.add_argument("--model", action="store_true", help="also make one short call to the local model")
    args = ap.parse_args(argv)
    rows = checks(args.model)
    for name, status, detail in rows:
        print(f"[{status}] {name:<22} {detail}")
    return 1 if any(status == FAIL for _, status, _ in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
