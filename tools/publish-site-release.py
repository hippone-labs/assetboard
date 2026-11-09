#!/usr/bin/env python3
"""Stage a notarized release in a clean site clone, without deploying or pushing: the disk image people download from the pages and the
zip the in-app update reads from latest.json."""
import argparse
import datetime
import hashlib
import html
import json
import plistlib
import re
import shutil
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import release_notes  # noqa: E402


def minimum_system(archive, version):
    """LSMinimumSystemVersion of the app inside the archive, which the app's updater compares with the Mac it runs on."""
    try:
        with zipfile.ZipFile(archive) as bundle:
            info = plistlib.loads(bundle.read("Assetboard.app/Contents/Info.plist"))
    except (KeyError, zipfile.BadZipFile, plistlib.InvalidFileException) as error:
        raise ValueError(f"Archive has no readable Assetboard.app/Contents/Info.plist: {error}") from None
    if info.get("CFBundleShortVersionString") != version:
        raise ValueError("The app's CFBundleShortVersionString must match the release version")
    minimum = info.get("LSMinimumSystemVersion")
    if not isinstance(minimum, str) or not re.fullmatch(r"\d+(\.\d+){0,2}", minimum):
        raise ValueError("The app must name its LSMinimumSystemVersion")
    return minimum


def stage(site, archive, disk_image, version, notes):
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Expected a stable x.y.z version")
    name = f"Assetboard-macOS-arm64-{version}.zip"
    if archive.name != name or not archive.is_file():
        raise ValueError("Archive name must match the release version")
    image = f"Assetboard-macOS-arm64-{version}.dmg"
    if disk_image.name != image or not disk_image.is_file():
        raise ValueError("Disk image name must match the release version")
    manifest_path = site / "downloads/latest.json"
    previous = json.loads(manifest_path.read_text())
    if tuple(map(int, version.split('.'))) <= tuple(map(int, previous['version'].split('.'))):
        raise ValueError("Release must be newer than the published version")
    destination, image_destination = site / "downloads" / name, site / "downloads" / image
    if destination.exists() or image_destination.exists():
        raise ValueError("Release archives are immutable")
    if not notes.strip():
        raise ValueError("Release notes are required")
    by_language = release_notes.split(notes)
    minimum = minimum_system(archive, version)
    # The second language's pages: Chinese under zh/ (English at the root), or before that move, English under en/.
    second = site / ("zh" if (site / "zh/index.html").is_file() else "en")
    pages = {}
    for path in [site / "index.html", second / "index.html"]:
        text = path.read_text()
        text, links = re.subn(r"/downloads/Assetboard-macOS-arm64-\d+\.\d+\.\d+\.(?:zip|dmg)", f"/downloads/{image}", text)
        text, labels = re.subn(r"v\d+\.\d+\.\d+(?= · macOS)", f"v{version}", text)
        if links != 2 or labels != 1:
            raise ValueError(f"Unexpected download layout: {path.name}")
        pages[path] = text
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    image_digest = hashlib.sha256(disk_image.read_bytes()).hexdigest()
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()
    row = (f'\n  <li><a href="/downloads/{image}" download>Assetboard {html.escape(version)}</a><span class="v-meta">{today} · SHA-256 '
           f'<code title="{image_digest}">{image_digest[:8]}…{image_digest[-8:]}</code></span></li>')
    for history in [site / "downloads/index.html", second / "downloads/index.html"]:
        text = pages.get(history, history.read_text())
        if text.count('<ul class="versions">') != 1:
            raise ValueError(f"Unexpected downloads history layout: {history.relative_to(site)}")
        pages[history] = text.replace('<ul class="versions">', '<ul class="versions">' + row, 1)
    # Every page names the release's minimum macOS (major version only), in either language.
    major = minimum.split('.')[0]
    for path in [site / "index.html", second / "index.html", site / "downloads/index.html", second / "downloads/index.html"]:
        text = pages.get(path, path.read_text())
        text, count = re.subn(r"macOS \d+(?= 或更高| or later)", f"macOS {major}", text)
        if not count:
            raise ValueError(f"No minimum macOS on {path.relative_to(site)}")
        pages[path] = text
    shutil.copyfile(archive, destination)
    shutil.copyfile(disk_image, image_destination)
    for path, text in pages.items():
        path.write_text(text)
    # notesByLanguage is what the app shows, its own language first; notes, English then Chinese, is for apps that predate it.
    manifest_path.write_text(json.dumps({"version": version, "minimumSystemVersion": minimum, "notes": release_notes.plain(by_language),
                                         "notesByLanguage": by_language, "assets": [
        {"name": name, "url": f"https://assetboard.app/downloads/{name}", "sha256": digest}
    ]}, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--archive', type=Path, required=True, help='the zip the in-app update installs')
    parser.add_argument('--disk-image', type=Path, required=True, help='the .dmg the download buttons offer')
    parser.add_argument('--version', required=True)
    parser.add_argument('--notes', type=Path, required=True)
    args = parser.parse_args()
    stage(args.site, args.archive, args.disk_image, args.version, args.notes.read_text())
