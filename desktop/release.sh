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
notary_kc=(); [[ -n "${NOTARY_KEYCHAIN:-}" ]] && notary_kc=(--keychain "$NOTARY_KEYCHAIN")
xcrun notarytool submit "dist/Assetboard-macOS-arm64-$version.zip" \
  --keychain-profile "$NOTARY_PROFILE" "${notary_kc[@]}" --wait --output-format json > "$RELEASE_DIR/notary.json"
/usr/bin/python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["status"] == "Accepted", "Notarization rejected"' "$RELEASE_DIR/notary.json"
xcrun stapler staple "$app"
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
xcrun notarytool submit "$dmg" --keychain-profile "$NOTARY_PROFILE" "${notary_kc[@]}" --wait --output-format json > "$RELEASE_DIR/notary-dmg.json"
/usr/bin/python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["status"] == "Accepted", "Disk image notarization rejected"' "$RELEASE_DIR/notary-dmg.json"
xcrun stapler staple "$dmg"
xcrun stapler validate "$dmg"
spctl -a -t open --context context:primary-signature -vv "$dmg"
shasum -a 256 "$dmg"
