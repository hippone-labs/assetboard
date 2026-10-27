#!/bin/zsh
set -euo pipefail
project_dir="${0:A:h:h}"
# ASSETBOARD_EDITION=free builds into dist/free/, so a full and a free build can sit side by side.
out_dir="$project_dir/dist"
free=0
[[ "${ASSETBOARD_EDITION:-}" == free ]] && free=1
(( free )) && out_dir="$out_dir/free"
# The free edition compiles without MCP, the connectors and AI (#if !ASSETBOARD_FREE) and ships no assetboard-cli.
swift_flags=()
(( free )) && swift_flags=(-D ASSETBOARD_FREE)
app_dir="$out_dir/Assetboard.app"
# Start from an empty bundle: files left by an older build (or the other edition) must not ship.
rm -rf "$app_dir"
mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources/Board"
xcrun swiftc "$project_dir/desktop/Assetboard.swift" "$project_dir/desktop/Localization.swift" "$project_dir/desktop/LocalizationEN.swift" "$project_dir/desktop/CloudflareInventory.swift" "$project_dir/desktop/ProbeSource.swift" "$project_dir/desktop/SSHProbe.swift" "$project_dir/desktop/LocalDatabase.swift" "$project_dir/desktop/OCRImporter.swift" "$project_dir/desktop/AIRecognizer.swift" "$project_dir/desktop/IconFetcher.swift" "$project_dir/desktop/LocalCLI.swift" "$project_dir/desktop/AgentInbox.swift" "$project_dir/desktop/AgentSocket.swift" "$project_dir/desktop/NetworkLog.swift" "$project_dir/desktop/ExchangeRates.swift" "$project_dir/desktop/Reminders.swift" "$project_dir/desktop/MoneyBridge.swift" "$project_dir/desktop/Updater.swift" "$project_dir/desktop/WindowChrome.swift" "${swift_flags[@]}" -o "$app_dir/Contents/MacOS/Assetboard" -framework Cocoa -framework WebKit -framework UserNotifications -framework PDFKit -framework Vision -lsqlite3 -O
# The command line and MCP server for agents; it only talks to the running app over its local socket.
if (( ! free )); then
  xcrun swiftc -parse-as-library "$project_dir/desktop/AssetboardCLI.swift" "$project_dir/desktop/Localization.swift" "$project_dir/desktop/LocalizationEN.swift" "$project_dir/desktop/AgentSocket.swift" -o "$app_dir/Contents/MacOS/assetboard-cli" -O
fi
cp "$project_dir/desktop/Info.plist" "$app_dir/Contents/Info.plist"
# The localizations macOS reads itself: Info.plist text (document type, Services menu); the rest is Localization.swift.
cp -R "$project_dir/desktop/en.lproj" "$project_dir/desktop/zh-Hans.lproj" "$app_dir/Contents/Resources/"
cp "$project_dir/index.html" "$project_dir/styles.css" "$project_dir/material.css" "$project_dir/app.js" "$project_dir/money-view.js" "$app_dir/Contents/Resources/Board/"
cp "$project_dir/theme.js" "$project_dir/asset-data.js" "$project_dir/demo-data.js" "$project_dir/features.js" "$project_dir/panorama.js" "$project_dir/panorama-view.js" "$project_dir/pro-slots.js" "$app_dir/Contents/Resources/Board/"
cp "$project_dir/i18n.js" "$app_dir/Contents/Resources/Board/"
mkdir -p "$app_dir/Contents/Resources/Board/i18n"
cp "$project_dir"/i18n/en-*.js "$app_dir/Contents/Resources/Board/i18n/"
# The Pro edition's web scripts, when this checkout has them; ASSETBOARD_EDITION=free builds the free edition from a full checkout,
# dropping the private block of index.html that loads them.
if [[ -d "$project_dir/pro/web" && "${ASSETBOARD_EDITION:-}" != free ]]; then
  mkdir -p "$app_dir/Contents/Resources/Board/pro/web"
  cp "$project_dir"/pro/web/*.js "$app_dir/Contents/Resources/Board/pro/web/"
else
  rm -rf "$app_dir/Contents/Resources/Board/pro"
  # [s]tart / [e]nd match the markers without spelling them, so the export's check for leftover markers stays clean.
  sed '/<!-- private:[s]tart -->/,/<!-- private:[e]nd -->/d' "$project_dir/index.html" > "$app_dir/Contents/Resources/Board/index.html"
fi
icon_src="$project_dir/desktop/icon-1024.png"
icon_dir="$out_dir/AppIcon.iconset"
rm -rf "$icon_dir"
mkdir -p "$icon_dir"
# icon-1024.png is full-bleed with no baked shadow: macOS applies the mask and shadow (see desktop/icons.py, --legacy for the pre-masked variant).
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$icon_src" --out "$icon_dir/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$icon_src" --out "$icon_dir/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$icon_dir" -o "$app_dir/Contents/Resources/AppIcon.icns"
# assetboard-cli is nested code: it is signed on its own first, then the bundle seals it.
if [[ -n "${SIGNING_IDENTITY:-}" ]]; then
  (( free )) || codesign --force --options runtime --timestamp --sign "$SIGNING_IDENTITY" "$app_dir/Contents/MacOS/assetboard-cli"
  codesign --force --options runtime --timestamp --sign "$SIGNING_IDENTITY" "$app_dir"
else
  (( free )) || codesign --force --sign - "$app_dir/Contents/MacOS/assetboard-cli"
  codesign --force --sign - "$app_dir"
fi
codesign --verify --deep --strict "$app_dir"
"$app_dir/Contents/MacOS/Assetboard" --test-store
"$app_dir/Contents/MacOS/Assetboard" --test-cloudflare
"$app_dir/Contents/MacOS/Assetboard" --test-cloudflare-inventory
"$app_dir/Contents/MacOS/Assetboard" --test-probe
"$app_dir/Contents/MacOS/Assetboard" --test-ssh-probe
"$app_dir/Contents/MacOS/Assetboard" --test-github
"$app_dir/Contents/MacOS/Assetboard" --test-ocr
"$app_dir/Contents/MacOS/Assetboard" --test-icons
"$app_dir/Contents/MacOS/Assetboard" --test-local
"$app_dir/Contents/MacOS/Assetboard" --test-inbox
"$app_dir/Contents/MacOS/Assetboard" --test-webview
"$app_dir/Contents/MacOS/Assetboard" --test-reminders
"$app_dir/Contents/MacOS/Assetboard" --test-ai
"$app_dir/Contents/MacOS/Assetboard" --test-network-log
"$app_dir/Contents/MacOS/Assetboard" --test-fx
"$app_dir/Contents/MacOS/Assetboard" --test-agent-socket
"$app_dir/Contents/MacOS/Assetboard" --test-update
(( free )) || "$app_dir/Contents/MacOS/assetboard-cli" --self-test
if (( free )); then
  leftovers="$(find "$app_dir" -name assetboard-cli)"
  if [[ -n "$leftovers" ]]; then print -u2 "free edition must not contain:"; print -u2 -- "$leftovers"; exit 1; fi
fi
printf '%s\n' "$app_dir"
