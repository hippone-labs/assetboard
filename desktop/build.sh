#!/bin/zsh
set -euo pipefail
project_dir="${0:A:h:h}"
# ASSETBOARD_EDITION=free builds without the Pro modules even when this checkout has pro/ (what building the public repository alone
# gives), into dist/free/, so both builds can sit side by side.
out_dir="$project_dir/dist"
free=0
[[ "${ASSETBOARD_EDITION:-}" == free ]] && free=1
(( free )) && out_dir="$out_dir/free"
swift_flags=()
# Pro's Swift (pro/desktop/: the offline licence check) when this checkout has it; ASSETBOARD_EDITION=free leaves it out.
pro_swift=()
if [[ -d "$project_dir/pro/desktop" ]] && (( ! free )); then pro_swift=("$project_dir"/pro/desktop/*.swift); swift_flags+=(-D ASSETBOARD_PRO); fi
# ASSETBOARD_PRO_DEV=1: a developer build for this Mac that counts as licensed without a licence (pro/desktop/License.swift). Its
# Info.plist carries AssetboardDeveloperBuild, and desktop/package.sh refuses to package it, so it is never signed or published.
dev=0
[[ "${ASSETBOARD_PRO_DEV:-}" == 1 && ${#pro_swift[@]} -gt 0 ]] && { dev=1; swift_flags+=(-D ASSETBOARD_PRO_DEV); }
app_dir="$out_dir/Assetboard.app"
# The oldest macOS the app runs on comes from LSMinimumSystemVersion. Without -target, swiftc builds for the macOS of the build
# machine, and dyld then stops the app at launch on every older system.
min_macos="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$project_dir/desktop/Info.plist")"
target=(-target "arm64-apple-macos$min_macos")
# Start from an empty bundle: files left by an older build (or the other edition) must not ship.
rm -rf "$app_dir"
mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources/Board"
xcrun swiftc "${target[@]}" "$project_dir/desktop/Assetboard.swift" "$project_dir/desktop/Localization.swift" "$project_dir/desktop/LocalizationEN.swift" "$project_dir/desktop/CloudflareInventory.swift" "$project_dir/desktop/RegistrarImport.swift" "$project_dir/desktop/CloudImport.swift" "$project_dir/desktop/ProbeSource.swift" "$project_dir/desktop/PlatformStatus.swift" "$project_dir/desktop/AIUsage.swift" "$project_dir/desktop/SSHProbe.swift" "$project_dir/desktop/SSHHosts.swift" "$project_dir/desktop/LocalDatabase.swift" "$project_dir/desktop/OCRImporter.swift" "$project_dir/desktop/AIRecognizer.swift" "$project_dir/desktop/IconFetcher.swift" "$project_dir/desktop/LocalCLI.swift" "$project_dir/desktop/GitHubPulls.swift" "$project_dir/desktop/AgentInbox.swift" "$project_dir/desktop/AgentSocket.swift" "$project_dir/desktop/AgentClients.swift" "$project_dir/desktop/NetworkLog.swift" "$project_dir/desktop/ExchangeRates.swift" "$project_dir/desktop/Reminders.swift" "$project_dir/desktop/MoneyBridge.swift" "$project_dir/desktop/Updater.swift" "$project_dir/desktop/WindowChrome.swift" "${pro_swift[@]}" "${swift_flags[@]}" -o "$app_dir/Contents/MacOS/Assetboard" -framework Cocoa -framework WebKit -framework JavaScriptCore -framework UserNotifications -framework PDFKit -framework Vision -lsqlite3 -O
# The command line and MCP server for agents; it only talks to the running app over its local socket.
xcrun swiftc "${target[@]}" -parse-as-library "$project_dir/desktop/AssetboardCLI.swift" "$project_dir/desktop/Localization.swift" "$project_dir/desktop/LocalizationEN.swift" "$project_dir/desktop/AgentSocket.swift" "$project_dir/desktop/AgentClients.swift" -o "$app_dir/Contents/MacOS/assetboard-cli" -O
cp "$project_dir/desktop/Info.plist" "$app_dir/Contents/Info.plist"
(( dev )) && /usr/libexec/PlistBuddy -c 'Add :AssetboardDeveloperBuild bool true' "$app_dir/Contents/Info.plist"
# ASSETBOARD_BUILD_STAMP (desktop/release.sh) makes each release build's code directory hash its own: a rebuild of a commit that
# was already notarized has that notarized hash, Gatekeeper treats the unstapled bundle as a notarized app, and App Management
# then refuses the runner's stapler the write of Contents/CodeResources (stapler Error 73, "CodeResources couldn't be removed").
[[ -n "${ASSETBOARD_BUILD_STAMP:-}" ]] && /usr/libexec/PlistBuddy -c "Add :AssetboardBuildStamp string $ASSETBOARD_BUILD_STAMP" "$app_dir/Contents/Info.plist"
# Every binary must be built for exactly that system (15.0 and 15 are the same).
version_core() { local v="$1"; while [[ "$v" == *.0 ]]; do v="${v%.0}"; done; print -r -- "$v"; }
for bin in "$app_dir"/Contents/MacOS/*; do
  minos="$(xcrun vtool -show-build "$bin" | awk '$1 == "minos" { print $2; exit }')"
  if [[ "$(version_core "$minos")" != "$(version_core "$min_macos")" ]]; then
    print -u2 "${bin:t} is built for macOS ${minos:-unknown}, but LSMinimumSystemVersion is $min_macos"; exit 1
  fi
done
# The localizations macOS reads itself: Info.plist text (document type, Services menu); the rest is Localization.swift.
cp -R "$project_dir/desktop/en.lproj" "$project_dir/desktop/zh-Hans.lproj" "$app_dir/Contents/Resources/"
cp "$project_dir/index.html" "$project_dir/styles.css" "$project_dir/material.css" "$project_dir/app.js" "$project_dir/money-view.js" "$project_dir/money-ledger.js" "$project_dir/project-money.js" "$project_dir/board-views.js" "$project_dir/board-wall.js" "$project_dir/board-free.js" "$project_dir/ai-usage.js" "$project_dir/ai-usage-view.js" "$project_dir/github-pulls.js" "$project_dir/pulls-view.js" "$project_dir/pro-load.js" "$app_dir/Contents/Resources/Board/"
cp "$project_dir/theme.js" "$project_dir/asset-data.js" "$project_dir/demo-data.js" "$project_dir/features.js" "$project_dir/panorama.js" "$project_dir/panorama-view.js" "$project_dir/pro-slots.js" "$app_dir/Contents/Resources/Board/"
cp "$project_dir/i18n.js" "$app_dir/Contents/Resources/Board/"
mkdir -p "$app_dir/Contents/Resources/Board/art"
cp -R "$project_dir/art/fridge" "$app_dir/Contents/Resources/Board/art/"
mkdir -p "$app_dir/Contents/Resources/Board/i18n"
cp "$project_dir"/i18n/en-*.js "$app_dir/Contents/Resources/Board/i18n/"
# The Pro modules' web scripts, when this checkout has them and ASSETBOARD_EDITION is not free.
if [[ -d "$project_dir/pro/web" ]] && (( ! free )); then
  mkdir -p "$app_dir/Contents/Resources/Board/pro/web"
  cp "$project_dir"/pro/web/*.js "$app_dir/Contents/Resources/Board/pro/web/"
else
  rm -rf "$app_dir/Contents/Resources/Board/pro"
  # [s]tart / [e]nd match the markers without spelling them, so the export's check for leftover markers stays clean.
  sed '/<!-- private:[s]tart -->/,/<!-- private:[e]nd -->/d' "$project_dir/index.html" > "$app_dir/Contents/Resources/Board/index.html"
fi
# The app icon. macOS 26 and later read CFBundleIconName from Assets.car, compiled by desktop/app-icon-car.sh (actool, Xcode) from
# the Icon Composer icon desktop/AppIcon.icon: one full-bleed layer the system masks and edges itself. An icon only in AppIcon.icns
# is put on a grey plate there. tools/app-icon.py makes AppIcon.icon and icon-macos-1024.png from desktop/icon-1024.png, the
# drawing rendered from desktop/icon.svg.
cmp -s "$project_dir/desktop/icon-1024.png" "$project_dir/desktop/AppIcon.icon/Assets/icon.png" \
  || { print -u2 "desktop/AppIcon.icon differs from desktop/icon-1024.png: run python3 tools/app-icon.py"; exit 1; }
[[ "$(awk '{ print $1 }' "$project_dir/desktop/Assets.car.sha256")" == "$(cat "$project_dir/desktop/AppIcon.icon/icon.json" "$project_dir/desktop/AppIcon.icon/Assets/icon.png" | shasum -a 256 | awk '{ print $1 }')" ]] \
  || { print -u2 "desktop/Assets.car is not compiled from the current desktop/AppIcon.icon: run desktop/app-icon-car.sh on a Mac with Xcode"; exit 1; }
cp "$project_dir/desktop/Assets.car" "$app_dir/Contents/Resources/Assets.car"
# AppIcon.icns for older systems (and the disk image's volume icon): icon-macos-1024.png is on Apple's macOS grid, 824 px body with
# rounded corners and shadow drawn in, transparent margin.
icon_src="$project_dir/desktop/icon-macos-1024.png"
icon_dir="$out_dir/AppIcon.iconset"
rm -rf "$icon_dir"
mkdir -p "$icon_dir"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$icon_src" --out "$icon_dir/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$icon_src" --out "$icon_dir/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$icon_dir" -o "$app_dir/Contents/Resources/AppIcon.icns"
# assetboard-cli is nested code: it is signed on its own first, then the bundle seals it.
if [[ -n "${SIGNING_IDENTITY:-}" ]]; then
  codesign --force --options runtime --timestamp --sign "$SIGNING_IDENTITY" "$app_dir/Contents/MacOS/assetboard-cli"
  codesign --force --options runtime --timestamp --sign "$SIGNING_IDENTITY" "$app_dir"
else
  codesign --force --sign - "$app_dir/Contents/MacOS/assetboard-cli"
  codesign --force --sign - "$app_dir"
fi
codesign --verify --deep --strict "$app_dir"
"$app_dir/Contents/MacOS/Assetboard" --test-store
"$app_dir/Contents/MacOS/Assetboard" --test-cloudflare
"$app_dir/Contents/MacOS/Assetboard" --test-cloudflare-inventory
"$app_dir/Contents/MacOS/Assetboard" --test-probe
"$app_dir/Contents/MacOS/Assetboard" --test-platform
"$app_dir/Contents/MacOS/Assetboard" --test-ai-usage
"$app_dir/Contents/MacOS/Assetboard" --test-ssh-probe
"$app_dir/Contents/MacOS/Assetboard" --test-github
"$app_dir/Contents/MacOS/Assetboard" --test-registrar
"$app_dir/Contents/MacOS/Assetboard" --test-cloud-import
"$app_dir/Contents/MacOS/Assetboard" --test-ocr
"$app_dir/Contents/MacOS/Assetboard" --test-icons
"$app_dir/Contents/MacOS/Assetboard" --test-app-icon
"$app_dir/Contents/MacOS/Assetboard" --test-local
"$app_dir/Contents/MacOS/Assetboard" --test-inbox
"$app_dir/Contents/MacOS/Assetboard" --test-webview
"$app_dir/Contents/MacOS/Assetboard" --test-reminders
"$app_dir/Contents/MacOS/Assetboard" --test-ai
"$app_dir/Contents/MacOS/Assetboard" --test-network-log
"$app_dir/Contents/MacOS/Assetboard" --test-fx
"$app_dir/Contents/MacOS/Assetboard" --test-rdap
"$app_dir/Contents/MacOS/Assetboard" --test-agent-socket
"$app_dir/Contents/MacOS/Assetboard" --test-agent-log
"$app_dir/Contents/MacOS/Assetboard" --test-update
(( ${#pro_swift} == 0 )) || "$app_dir/Contents/MacOS/Assetboard" --test-license
"$app_dir/Contents/MacOS/assetboard-cli" --self-test
if (( free )); then
  leftovers="$(find "$app_dir/Contents/Resources/Board" -maxdepth 1 -name pro)"
  if [[ -n "$leftovers" ]]; then print -u2 "a build without the Pro modules must not contain:"; print -u2 -- "$leftovers"; exit 1; fi
fi
printf '%s\n' "$app_dir"
