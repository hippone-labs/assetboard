#!/bin/zsh
# Builds the drag-to-Applications disk image the site offers for download: the app beside a link to /Applications on the
# background from desktop/dmg/background.svg. Usage: desktop/dmg.sh <Assetboard.app> <output.dmg>
# Signing, notarization and stapling of the image are release.sh's job; the in-app update keeps using the zip.
set -euo pipefail
project_dir="${0:A:h:h}"
app="${1:?Usage: desktop/dmg.sh <Assetboard.app> <output.dmg>}"
out="${2:?Usage: desktop/dmg.sh <Assetboard.app> <output.dmg>}"
app="${app:A}" out="${out:A}"
[[ -d "$app/Contents" ]] || { print -u2 "Not an app bundle: $app"; exit 1; }
venv="$HOME/.cache/assetboard-ci/dmgbuild-1.6.5"
if [[ ! -x "$venv/bin/dmgbuild" ]]; then
  rm -rf "$venv"
  /usr/bin/python3 -m venv "$venv"
  "$venv/bin/python" -m pip install --quiet --disable-pip-version-check --no-deps --require-hashes -r "$project_dir/desktop/dmg/requirements.txt"
fi
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# One TIFF holding both resolutions, so Retina screens get the sharp one.
tiffutil -cathidpicheck "$project_dir/desktop/dmg/background.png" "$project_dir/desktop/dmg/background@2x.png" -out "$work/background.tiff" >/dev/null
rm -f "$out"
"$venv/bin/dmgbuild" -s "$project_dir/desktop/dmg/settings.py" -D app="$app" -D background="$work/background.tiff" \
  -D icon="$app/Contents/Resources/AppIcon.icns" Assetboard "$out"
hdiutil verify -quiet "$out"
# What a person sees after opening it: the app, the Applications link and the layout file.
mount="$work/mount"
mkdir "$mount"
hdiutil attach -quiet -nobrowse -readonly -mountpoint "$mount" "$out"
trap 'hdiutil detach -quiet "$mount" 2>/dev/null || true; rm -rf "$work"' EXIT
[[ -d "$mount/$(basename "$app")" && -L "$mount/Applications" && "$(readlink "$mount/Applications")" == /Applications && -f "$mount/.DS_Store" ]] \
  || { print -u2 "The disk image lacks the app, the Applications link or its layout"; exit 1; }
codesign --verify --deep --strict "$mount/$(basename "$app")"
hdiutil detach -quiet "$mount"
printf '%s\n' "$out"
