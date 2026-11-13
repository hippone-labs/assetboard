#!/bin/zsh
# Build the Pro developer build of this checkout and install it over /Applications/Assetboard.app on this Mac (the Mac mini or the
# MacBook Pro after a release, from .github/workflows/mini-dev.yml or mbp-dev.yml, or by hand: zsh desktop/dev-install.sh). It needs the private Pro checkout
# at pro/ and fails without it, rather than installing a free build. The build is ad-hoc signed, never with the release identity,
# and stays on this Mac. A running Assetboard is asked to quit; one that does not quit in time is left running and nothing is
# installed. The replaced app is kept for rollback; the board's data (~/Library/Application Support/Assetboard) is never touched.
# ASSETBOARD_INSTALL_DIR (default /Applications) and ASSETBOARD_DEV_BACKUP_DIR are for trying it out elsewhere.
set -euo pipefail
cd "${0:A:h:h}"
bundle_id=studio.assetboard.local
dest_dir="${ASSETBOARD_INSTALL_DIR:-/Applications}"
dest="$dest_dir/Assetboard.app"
backup_dir="${ASSETBOARD_DEV_BACKUP_DIR:-$HOME/Library/Caches/$bundle_id.dev-install}"
backup="$backup_dir/Assetboard-previous.app"
quit_wait="${ASSETBOARD_QUIT_WAIT:-60}"
fail() { print -u2 "dev-install: $*"; exit 1; }
plist() { /usr/libexec/PlistBuddy -c "Print :$2" "$1/Contents/Info.plist" 2>/dev/null; }
running() { /usr/bin/pgrep -f "^$dest/Contents/MacOS/Assetboard( |$)" >/dev/null; }
# open hands its environment to the app. A clean one leaves out the job's variables, RUNNER_TRACKING_ID among them, by which the
# Actions runner finds and terminates the processes a job leaves running when it ends.
launch() { /usr/bin/env -i HOME="$HOME" USER="${USER:-$(id -un)}" PATH=/usr/bin:/bin:/usr/sbin:/sbin TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-en_US.UTF-8}" /usr/bin/open "$1"; }

# Without Pro, build.sh quietly builds the board without the plugin and without the developer flag.
[[ -f pro/web/pro.js ]] || fail "the private Pro checkout is missing at pro/ (pro/web/pro.js)"
unset SIGNING_IDENTITY NOTARY_PROFILE NOTARY_KEYCHAIN ASSETBOARD_EDITION
commit="$(git rev-parse --short HEAD 2>/dev/null || print unknown)"
ASSETBOARD_PRO_DEV=1 zsh desktop/build.sh
app=dist/Assetboard.app
[[ "$(plist "$app" AssetboardDeveloperBuild)" == true ]] || fail "$app is not a developer build"
[[ "$(plist "$app" CFBundleIdentifier)" == "$bundle_id" ]] || fail "$app has another bundle identifier"
[[ -f "$app/Contents/Resources/Board/pro/web/pro.js" ]] || fail "$app has no Pro web scripts"
codesign --verify --deep --strict "$app"
codesign -dv "$app" 2>&1 | grep -qx 'Signature=adhoc' || fail "$app must be ad-hoc signed"
version="$(plist "$app" CFBundleShortVersionString) ($(plist "$app" CFBundleVersion))"

# Staged beside the destination, so the swap is a rename on one volume.
mkdir -p "$backup_dir"
staged="$dest_dir/.Assetboard-dev-install.$$.app"
rm -rf "$staged"
trap 'rm -rf "$staged"' EXIT
ditto "$app" "$staged"
codesign --verify --deep --strict "$staged"

was_running=0
if running; then
  was_running=1
  echo "Asking the running Assetboard to quit"
  # A quit request, as from the menu, so the app saves and closes normally. It is never killed.
  perl -e 'alarm shift; exec @ARGV' 30 /usr/bin/osascript -e "tell application id \"$bundle_id\" to quit" >/dev/null || true
  i=0
  while running; do
    (( ++i > quit_wait * 2 )) && fail "Assetboard did not quit within ${quit_wait}s; it is still running and nothing was installed"
    sleep 0.5
  done
fi

if [[ -e "$dest" ]]; then
  echo "Replacing $dest ($(plist "$dest" CFBundleShortVersionString) ($(plist "$dest" CFBundleVersion)), developer build: $(plist "$dest" AssetboardDeveloperBuild || print false))"
  rm -rf "$backup"
  mv "$dest" "$backup"
fi
restore() {
  print -u2 "dev-install: $1; putting the previous app back"
  rm -rf "$dest"
  [[ -e "$backup" ]] && mv "$backup" "$dest"
  (( was_running )) && [[ -e "$dest" ]] && launch "$dest"
  exit 1
}
mv "$staged" "$dest" || restore "could not move the new app into place"
if (( was_running )); then
  launch "$dest" || restore "the new app did not open"
  i=0
  until running; do (( ++i > 100 )) && restore "the new app did not start"; sleep 0.1; done
  sleep 3
  running || restore "the new app quit right after starting"
fi
printf 'commit=%s\nversion=%s\ninstalled=%s\n' "$commit" "$version" "$(date '+%Y-%m-%dT%H:%M:%S%z')" > "$backup_dir/installed.txt"
echo "Installed the developer build $version of $commit at $dest$( (( was_running )) && print ' and reopened it')"
(( was_running )) || echo "Assetboard was not running, so it was not opened"
[[ -e "$backup" ]] && echo "The previous app is kept at $backup"
exit 0
