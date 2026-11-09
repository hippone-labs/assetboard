#!/bin/zsh
# Compiles the Icon Composer icon desktop/AppIcon.icon into desktop/Assets.car with actool, which comes with Xcode (26 or later), and
# records the sha256 of its source in desktop/Assets.car.sha256. build.sh copies the committed Assets.car, so the Macs that build
# and release need no Xcode; it refuses a car whose recorded source is not the current AppIcon.icon.
# Usage: desktop/app-icon-car.sh
set -euo pipefail
project_dir="${0:A:h:h}"
icon="$project_dir/desktop/AppIcon.icon"
min_macos="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$project_dir/desktop/Info.plist")"
source_sum="$(cat "$icon/icon.json" "$icon/Assets/icon.png" | shasum -a 256 | awk '{ print $1 }')"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
xcrun actool --version
xcrun actool "$icon" --compile "$work" --platform macosx --target-device mac --minimum-deployment-target "$min_macos" --app-icon AppIcon \
  --output-partial-info-plist "$work/partial.plist" --errors --warnings --output-format human-readable-text
[[ -f "$work/Assets.car" && "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconName' "$work/partial.plist")" == AppIcon ]] \
  || { print -u2 "actool made no Assets.car with the icon AppIcon"; exit 1; }
xcrun assetutil --info "$work/Assets.car" | grep -q '"Name" : "AppIcon"' || { print -u2 "Assets.car has no AppIcon"; exit 1; }
cp "$work/Assets.car" "$project_dir/desktop/Assets.car"
print -r -- "$source_sum  AppIcon.icon" > "$project_dir/desktop/Assets.car.sha256"
print -r -- "$project_dir/desktop/Assets.car"
