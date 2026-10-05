#!/usr/bin/env python3
"""Fill the OCR cache: the inference runtime and the models a riven
screenshot is read with, into web/cache/ocr/ (gitignored).

Every file is pinned by version and sha256 in web/ocr/pins.json, which the
site build and the native server read too; a file that does not match its
hash is refused, never cached. Both deployments serve these SAME-ORIGIN — a
CDN is unreliable from mainland China. Licenses: web/ocr/LICENSES.txt.

Usage: python scripts/fetch_ocr.py
"""
import hashlib
import io
import json
import shutil
import sys
import tarfile
import urllib.request
from pathlib import Path

from bot_auth import bot_headers

ROOT = Path(__file__).resolve().parent.parent
PINS = json.loads((ROOT / "web" / "ocr" / "pins.json").read_text(encoding="utf-8"))["files"]
CACHE = ROOT / "web" / "cache" / "ocr"
UA = "wfsim/0.1 (https://github.com/magenie33/wfsim)"


def tarball(package: str, version: str) -> tarfile.TarFile:
    name = package.split("/")[-1]
    url = f"https://registry.npmjs.org/{package}/-/{name}-{version}.tgz"
    req = urllib.request.Request(url, headers=bot_headers(url, {"User-Agent": UA}))
    with urllib.request.urlopen(req, timeout=120) as r:
        return tarfile.open(fileobj=io.BytesIO(r.read()), mode="r:gz")


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    have = lambda p: (CACHE / p["name"]).exists() and \
        hashlib.sha256((CACHE / p["name"]).read_bytes()).hexdigest() == p["sha256"]
    todo = [p for p in PINS if not have(p)]
    for key in sorted({(p["package"], p["version"]) for p in todo}):
        tar = tarball(*key)
        for p in (x for x in todo if (x["package"], x["version"]) == key):
            data = tar.extractfile(p["path"]).read()
            got = hashlib.sha256(data).hexdigest()
            if got != p["sha256"]:
                sys.exit(f"{p['name']}: sha256 {got} is not the pinned {p['sha256']}")
            (CACHE / p["name"]).write_bytes(data)
            print(f"cached {p['name']} ({len(data):,} bytes)")
    shutil.copy2(ROOT / "web" / "ocr" / "LICENSES.txt", CACHE / "LICENSES.txt")
    print(f"{len(PINS)} OCR files in {CACHE}")


if __name__ == "__main__":
    main()
