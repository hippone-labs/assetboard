#!/usr/bin/env python3
"""Stage a notarized archive in a clean site clone, without deploying or pushing."""
import argparse
import datetime
import hashlib
import html
import json
import re
import shutil
from pathlib import Path


def stage(site, archive, version, notes):
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Expected a stable x.y.z version")
    name = f"Assetboard-macOS-arm64-{version}.zip"
    if archive.name != name or not archive.is_file():
        raise ValueError("Archive name must match the release version")
    manifest_path = site / "downloads/latest.json"
    previous = json.loads(manifest_path.read_text())
    if tuple(map(int, version.split('.'))) <= tuple(map(int, previous['version'].split('.'))):
        raise ValueError("Release must be newer than the published version")
    destination = site / "downloads" / name
    if destination.exists():
        raise ValueError("Release archives are immutable")
    if not notes.strip():
        raise ValueError("Release notes are required")
    pages = {}
    for path in [site / "index.html", site / "en/index.html"]:
        text = path.read_text()
        text, links = re.subn(r"/downloads/Assetboard-macOS-arm64-\d+\.\d+\.\d+\.zip", f"/downloads/{name}", text)
        text, labels = re.subn(r"v\d+\.\d+\.\d+(?= · macOS)", f"v{version}", text)
        if links != 2 or labels != 1:
            raise ValueError(f"Unexpected download layout: {path.name}")
        pages[path] = text
    history = site / "downloads/index.html"
    text = history.read_text()
    if text.count('<ul>') != 1:
        raise ValueError("Unexpected downloads history layout")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()
    row = f'\n  <li><a href="/downloads/{name}" download>Assetboard {html.escape(version)}</a> · {today} · SHA-256 <code>{digest[:8]}…{digest[-8:]}</code></li>'
    pages[history] = text.replace('<ul>', '<ul>' + row, 1)
    shutil.copyfile(archive, destination)
    for path, text in pages.items():
        path.write_text(text)
    manifest_path.write_text(json.dumps({"version": version, "notes": notes, "assets": [
        {"name": name, "url": f"https://assetboard.app/downloads/{name}", "sha256": digest}
    ]}, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--notes', type=Path, required=True)
    args = parser.parse_args()
    stage(args.site, args.archive, args.version, args.notes.read_text())
