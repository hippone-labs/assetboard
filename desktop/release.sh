#!/bin/zsh
# Produce the signed, notarized and stapled release: the zip the in-app update installs and the disk image the site offers.
# Signing credentials stay on the Mac runner.
set -euo pipefail
cd "${0:A:h:h}"
: "${SIGNING_IDENTITY:?Set SIGNING_IDENTITY}"
: "${NOTARY_PROFILE:?Set NOTARY_PROFILE}"
: "${RELEASE_DIR:?Set RELEASE_DIR}"
mkdir -p "$RELEASE_DIR"
# Publishing must use the final archive, after stapling, never package.sh's intermediate zip.
unset SITE_DIR
./desktop/package.sh
app=dist/Assetboard.app
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")"
"$app/Contents/MacOS/Assetboard" --test-store
"$app/Contents/MacOS/Assetboard" --test-license
"$app/Contents/MacOS/Assetboard" --test-update
codesign --verify --deep --strict --verbose=2 "$app"
# A background runner without macOS App Management access may be unable to write inside an app bundle.
# Check before submitting to Apple; remove the probe before verifying or stapling the signed app.
node - "$app" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const probe = path.join(process.argv[2], `.assetboard-write-probe-${process.pid}`);
try {
  fs.closeSync(fs.openSync(probe, 'wx', 0o600));
  fs.unlinkSync(probe);
} catch (error) {
  console.error(`Cannot write inside the app bundle (${error.code || 'unknown error'}). Check the runner's macOS App Management permission.`);
  process.exit(1);
}
JS
codesign --verify --deep --strict "$app"
notary_kc=(); [[ -n "${NOTARY_KEYCHAIN:-}" ]] && notary_kc=(--keychain "$NOTARY_KEYCHAIN")
# Submit once and keep its ID before waiting. A timeout does not prove that Apple failed to receive the upload.
notarize() {
  local file=$1 out=$2 attempt id submit="${2%.json}-submission.json"
  if ! xcrun notarytool submit "$file" --keychain-profile "$NOTARY_PROFILE" "${notary_kc[@]}" --output-format json > "$submit"; then
    echo "Notary submission did not return an ID. Check notarytool history before submitting this file again." >&2
    return 1
  fi
  id="$(/usr/bin/python3 -c 'import json,sys,uuid; print(uuid.UUID(json.load(open(sys.argv[1]))["id"]))' "$submit")" || return 1
  echo "Waiting for notary submission $id"
  for attempt in 1 2 3 4; do
    if xcrun notarytool wait "$id" --keychain-profile "$NOTARY_PROFILE" "${notary_kc[@]}" --timeout 10m --output-format json > "$out"; then return 0; fi
    echo "notarytool wait failed for $id (attempt $attempt of 4); retrying the same submission" >&2
    (( attempt < 4 )) && sleep $(( attempt * 30 ))
  done
  return 1
}
# Stapler can fail for reasons including local permissions and ticket lookup; retain verbose diagnostics on failure.
staple() {
  local target=$1 attempt
  for attempt in 1 2 3 4 5 6; do
    if xcrun stapler staple "$target"; then return 0; fi
    echo "stapler failed (attempt $attempt of 6); checking again" >&2
    (( attempt < 6 )) && sleep 30
  done
  # Report the ticket request and connectivity without assuming the cause of Error 73.
  xcrun stapler staple -v "$target" 2>&1 | tail -40 || true
  curl -sS -o /dev/null -w 'api.apple-cloudkit.com: HTTP %{http_code} via %{remote_ip}\n' https://api.apple-cloudkit.com/ || true
  return 1
}
notarize "dist/Assetboard-macOS-arm64-$version.zip" "$RELEASE_DIR/notary.json"
/usr/bin/python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["status"] == "Accepted", "Notarization rejected"' "$RELEASE_DIR/notary.json"
staple "$app"
xcrun stapler validate "$app"
spctl -a -vv "$app"
archive="$RELEASE_DIR/Assetboard-macOS-arm64-$version.zip"
ditto -c -k --sequesterRsrc --keepParent "$app" "$archive"
unzip -tq "$archive"
# Verify what will actually be downloaded, including its stapled ticket.
audit="$(mktemp -d "$RELEASE_DIR/audit.XXXXXX")"
ditto -xk "$archive" "$audit"
codesign --verify --deep --strict "$audit/Assetboard.app"
xcrun stapler validate "$audit/Assetboard.app"
"$audit/Assetboard.app/Contents/MacOS/Assetboard" --test-store
rm -rf "$audit"
shasum -a 256 "$archive"
# The disk image is built from the stapled app, then signed, notarized and stapled itself, so it opens without a warning offline too.
dmg="$RELEASE_DIR/Assetboard-macOS-arm64-$version.dmg"
./desktop/dmg.sh "$app" "$dmg"
codesign --sign "$SIGNING_IDENTITY" --timestamp "$dmg"
notarize "$dmg" "$RELEASE_DIR/notary-dmg.json"
/usr/bin/python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["status"] == "Accepted", "Disk image notarization rejected"' "$RELEASE_DIR/notary-dmg.json"
staple "$dmg"
xcrun stapler validate "$dmg"
spctl -a -t open --context context:primary-signature -vv "$dmg"
shasum -a 256 "$dmg"
