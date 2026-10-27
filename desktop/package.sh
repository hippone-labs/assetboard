#!/bin/zsh
set -euo pipefail

if [[ "${SIGNING_IDENTITY:-}" != 'Developer ID Application:'* ]]; then
  print -u2 'Set SIGNING_IDENTITY to your Developer ID Application certificate name.'
  exit 1
fi

project_dir="${0:A:h:h}"
"$project_dir/desktop/build.sh"

# ASSETBOARD_EDITION=free packages dist/free/ as Assetboard-Free-…; the in-app update picks its archive by this name
# (Updater.assetName in desktop/Updater.swift), so the two must change together.
out_dir="$project_dir/dist" prefix=Assetboard
[[ "${ASSETBOARD_EDITION:-}" == free ]] && { out_dir="$out_dir/free"; prefix=Assetboard-Free; }
app_dir="$out_dir/Assetboard.app"
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_dir/Contents/Info.plist")"
archive_path="$out_dir/$prefix-macOS-arm64-$version.zip"
codesign --verify --deep --strict --verbose=2 "$app_dir"
ditto -c -k --sequesterRsrc --keepParent "$app_dir" "$archive_path"
unzip -tq "$archive_path"
shasum -a 256 "$archive_path"
# SITE_DIR=<checkout of the site> also puts the archive into its downloads/ and rewrites downloads/latest.json, the version file the
# app's 检查更新 reads (desktop/Updater.swift): version, notes (docs/releases/<version>.md when it exists), every archive with its
# SHA-256. Installers are published on the site only (2026-10-24); commit and deploy the site afterwards.
if [[ -n "${SITE_DIR:-}" ]]; then
  [[ -d "$SITE_DIR/downloads" ]] || { print -u2 "SITE_DIR has no downloads/ folder: $SITE_DIR"; exit 1; }
  cp "$archive_path" "$SITE_DIR/downloads/"
  notes_file="$project_dir/docs/releases/$version.md"
  SITE_DIR="$SITE_DIR" VERSION="$version" NOTES_FILE="$notes_file" /usr/bin/python3 - <<'PY'
import hashlib, json, os, re
site, version = os.environ["SITE_DIR"], os.environ["VERSION"]
notes = open(os.environ["NOTES_FILE"], encoding="utf-8").read() if os.path.exists(os.environ["NOTES_FILE"]) else ""
folder = os.path.join(site, "downloads")
assets = []
for name in sorted(os.listdir(folder)):
    if re.fullmatch(r"Assetboard(-Free)?-macOS-arm64-" + re.escape(version) + r"\.zip", name):
        with open(os.path.join(folder, name), "rb") as f: digest = hashlib.sha256(f.read()).hexdigest()
        assets.append({"name": name, "url": "https://assetboard.app/downloads/" + name, "sha256": digest})
with open(os.path.join(folder, "latest.json"), "w", encoding="utf-8") as f:
    json.dump({"version": version, "notes": notes, "assets": assets}, f, ensure_ascii=False, indent=2); f.write("\n")
print(os.path.join(folder, "latest.json"))
PY
fi
printf '%s\n' "$archive_path"
