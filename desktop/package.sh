#!/bin/zsh
set -euo pipefail

if [[ "${SIGNING_IDENTITY:-}" != 'Developer ID Application:'* ]]; then
  print -u2 'Set SIGNING_IDENTITY to your Developer ID Application certificate name.'
  exit 1
fi

project_dir="${0:A:h:h}"
# One package: the official build (free without a licence). A build without the Pro modules is for building from source, never published.
if [[ "${ASSETBOARD_EDITION:-}" == free ]]; then
  print -u2 'ASSETBOARD_EDITION=free is not packaged: only the official build is published. Unset it.'
  exit 1
fi
# A developer build (ASSETBOARD_PRO_DEV=1, Pro without a licence) is for one Mac only and is never packaged.
if [[ -n "${ASSETBOARD_PRO_DEV:-}" ]]; then
  print -u2 'ASSETBOARD_PRO_DEV is set: developer builds are not packaged. Unset it and build again.'
  exit 1
fi
# A signed build must carry the production licence key: with the placeholder in pro/desktop/License.swift no licence verifies.
if [[ -f "$project_dir/pro/desktop/License.swift" ]] && grep -q 'PRODUCTION_PUBLIC_KEY_PLACEHOLDER' "$project_dir/pro/desktop/License.swift"; then
  print -u2 'Put the production public key into ProLicense.publicKeyBase64 (pro/desktop/License.swift) first: node pro/worker/keygen.mjs'
  exit 1
fi
"$project_dir/desktop/build.sh"
if /usr/libexec/PlistBuddy -c 'Print :AssetboardDeveloperBuild' "$project_dir/dist/Assetboard.app/Contents/Info.plist" >/dev/null 2>&1; then
  print -u2 'dist/Assetboard.app is a developer build; it is not packaged.'
  exit 1
fi

# The in-app update picks its archive by this name (Updater.assetName in desktop/Updater.swift), so the two must change together.
out_dir="$project_dir/dist" prefix=Assetboard
app_dir="$out_dir/Assetboard.app"
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_dir/Contents/Info.plist")"
min_macos="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$app_dir/Contents/Info.plist")"
archive_path="$out_dir/$prefix-macOS-arm64-$version.zip"
codesign --verify --deep --strict --verbose=2 "$app_dir"
ditto -c -k --sequesterRsrc --keepParent "$app_dir" "$archive_path"
unzip -tq "$archive_path"
shasum -a 256 "$archive_path"
# SITE_DIR=<checkout of the site> also puts the archive into its downloads/ and rewrites downloads/latest.json, the version file the
# app's 检查更新 reads (desktop/Updater.swift): version, minimumSystemVersion (the app's LSMinimumSystemVersion; the app skips a
# release its Mac is too old for), notes and notesByLanguage (docs/releases/<version>.md when it exists, tools/release_notes.py),
# every archive with its SHA-256.
# Installers are published on the site only (2026-10-24); commit and deploy the site afterwards.
if [[ -n "${SITE_DIR:-}" ]]; then
  [[ -d "$SITE_DIR/downloads" ]] || { print -u2 "SITE_DIR has no downloads/ folder: $SITE_DIR"; exit 1; }
  cp "$archive_path" "$SITE_DIR/downloads/"
  notes_file="$project_dir/docs/releases/$version.md"
  SITE_DIR="$SITE_DIR" VERSION="$version" MIN_MACOS="$min_macos" NOTES_FILE="$notes_file" TOOLS_DIR="$project_dir/tools" /usr/bin/python3 - <<'PY'
import hashlib, json, os, re, sys
sys.path.insert(0, os.environ["TOOLS_DIR"])
import release_notes
site, version = os.environ["SITE_DIR"], os.environ["VERSION"]
notes = release_notes.split(open(os.environ["NOTES_FILE"], encoding="utf-8").read() if os.path.exists(os.environ["NOTES_FILE"]) else "")
folder = os.path.join(site, "downloads")
assets = []
for name in sorted(os.listdir(folder)):
    if re.fullmatch(r"Assetboard-macOS-arm64-" + re.escape(version) + r"\.zip", name):
        with open(os.path.join(folder, name), "rb") as f: digest = hashlib.sha256(f.read()).hexdigest()
        assets.append({"name": name, "url": "https://assetboard.app/downloads/" + name, "sha256": digest})
with open(os.path.join(folder, "latest.json"), "w", encoding="utf-8") as f:
    json.dump({"version": version, "minimumSystemVersion": os.environ["MIN_MACOS"], "notes": release_notes.plain(notes) if notes else "",
               "notesByLanguage": notes, "assets": assets}, f, ensure_ascii=False, indent=2); f.write("\n")
print(os.path.join(folder, "latest.json"))
PY
fi
printf '%s\n' "$archive_path"
