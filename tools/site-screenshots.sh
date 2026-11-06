#!/bin/zsh
# The site's screenshots (assetboard.app/assets): the demo board in each language and appearance, drawn by the app itself
# (`--snapshot`, no screen-recording permission needed). Run on a Mac after ./desktop/build.sh, or through the site-screenshots
# workflow on the Mac mini.
#   tools/site-screenshots.sh [out-dir]      → app-dark-zh.png, app-themes-light-zh.png, one dark shot per feature the site
#                                                explains (app-upcoming-dark-zh.png, …), 添加资产, the calendar and the grid, and the same with -en
# Demo mode only (fictional data, temp store, never saves); the site converts the PNGs to WebP.
set -euo pipefail
cd "${0:A:h:h}"
out="${1:-dist/site-screenshots}"
mkdir -p "$out"
app=dist/Assetboard.app/Contents/MacOS/Assetboard
test -x "$app" || { echo "Build first: ./desktop/build.sh" >&2; exit 1; }

shot() { # name, then the app's arguments
  local name=$1; shift
  "$app" --demo --window-size=1686x1050 --snapshot="$out/$name.png" "$@"
  test -s "$out/$name.png"
  echo "$out/$name.png"
}

for lang in zh en; do
  shot "app-dark-$lang" --lang "$lang" --dark --open-asset=demo-d1
  shot "app-themes-light-$lang" --lang "$lang" --light --open-asset=demo-d1 --open-theme
  # The site's feature section: what is due, what it costs, the year's dates, what runs where, live readings, free-tier sleep.
  shot "app-upcoming-dark-$lang" --lang "$lang" --dark --open-view=upcoming --layout=list --open-asset=demo-d1
  shot "app-cost-dark-$lang" --lang "$lang" --dark --open-asset=demo-d1 --open-cost
  shot "app-timeline-dark-$lang" --lang "$lang" --dark --layout=timeline --open-asset=demo-d1
  shot "app-panorama-dark-$lang" --lang "$lang" --dark --panorama
  shot "app-live-dark-$lang" --lang "$lang" --dark --open-asset=demo-s1
  shot "app-sleep-dark-$lang" --lang "$lang" --dark --open-asset=demo-db2
  # Adding a record, the month calendar and the grid.
  shot "app-add-dark-$lang" --lang "$lang" --dark --open-add
  shot "app-calendar-dark-$lang" --lang "$lang" --dark --open-view=upcoming --layout=calendar
  shot "app-grid-dark-$lang" --lang "$lang" --dark --layout=grid --open-asset=demo-d1
done
