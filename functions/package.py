"""Build the Functions deployment package: one folder with every function's code side by side.

    python functions/package.py                  # writes functions/dist/ (ignored by git)
    python functions/package.py --out <dir>
    cd functions/dist && func start              # run the package itself locally; local settings: copy
                                                 # local.settings.example.json to functions/local.settings.json first
    cd functions/dist && func azure functionapp publish <app>     # Azure (sprint A4)

The package holds the Functions files from this folder, plus archiver/, agents/ and mcp_server/ as subfolders, the
layout function_app.py and moment_trigger.py look for first (in the repository they are siblings of functions/).
Only runtime code and data go in: no tests, specs, evaluations, virtual environments or caches. The host installs
requirements.txt, so every function runs on one Python with one set of packages. Standard library only.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

FUNCTION_FILES = ("function_app.py", "host.json", "requirements.txt", "screen_relay.py", "relay_store.py",
                  "moment_trigger.py")
SKIP = shutil.ignore_patterns("tests", "specs", "evals", "build", "*.egg-info", ".venv", "__pycache__", "*.pyc",
                              ".pytest_cache", ".ruff_cache", "uv.lock", "pyproject.toml", "README.md", "*.zip")
# Command-line tools that only run on a laptop; the host never imports them
LOCAL_ONLY = {"agents": ("run_match.py", "smoke.py", "check_delivery.py"), "archiver": ("main.py",)}
FUNCIGNORE = "tests\n__pycache__\n*.pyc\n.venv\nlocal.settings.json\n.funcignore\n"


def build(out: Path) -> list[str]:
    if out.exists():
        ours = (out / "function_app.py").exists() or (out / "host.json").exists()    # also a half-removed one
        if any(out.iterdir()) and not ours:
            raise SystemExit(f"{out} exists and is not a package built here; choose another --out")
        shutil.rmtree(out)                    # fails while `func start` runs in it: stop the host first
    out.mkdir(parents=True)
    for name in FUNCTION_FILES:
        shutil.copy2(HERE / name, out / name)
    for folder in ("archiver", "agents", "mcp_server"):
        shutil.copytree(ROOT / folder, out / folder, ignore=SKIP)
        for name in LOCAL_ONLY.get(folder, ()):
            (out / folder / name).unlink(missing_ok=True)
    (out / ".funcignore").write_text(FUNCIGNORE, encoding="utf-8")
    if (HERE / "local.settings.json").exists():           # your own local settings (ignored by git and by publish)
        shutil.copy2(HERE / "local.settings.json", out / "local.settings.json")
    return sorted(str(p.relative_to(out)).replace("\\", "/") for p in out.rglob("*") if p.is_file())


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="package")
    ap.add_argument("--out", type=Path, default=HERE / "dist")
    args = ap.parse_args(argv)
    files = build(args.out.resolve())
    print(f"{len(files)} files in {args.out}")
    for top in ("archiver", "agents", "mcp_server"):
        print(f"  {top}/: {sum(f.startswith(top + '/') for f in files)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
