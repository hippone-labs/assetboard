#!/bin/bash
# The GitHub-hosted Mac jobs (.github/workflows/build.yml, notarize.yml, release-app.yml):
#   xcode     selects the pinned Xcode (XCODE_VERSION) and shows its swiftc.
#   keychain  creates a temporary keychain in RUNNER_TEMP, imports the Developer ID p12 (DEVELOPER_ID_P12_BASE64,
#             DEVELOPER_ID_P12_PASSWORD), stores a notarytool profile from the App Store Connect API key (NOTARY_KEY_P8_BASE64,
#             NOTARY_KEY_ID, NOTARY_ISSUER_ID) in it, and exports NOTARY_PROFILE and NOTARY_KEYCHAIN for desktop/release.sh.
#   cleanup   deletes that keychain and the decoded key files; run it with if: always().
# No secret is echoed: the decoded files are written with umask 077 and removed at once, the keychain password is random and masked.
# A Mac run by hand uses its own login keychain and notary profile instead (desktop/release.sh).
set -euo pipefail

: "${RUNNER_TEMP:?Run in GitHub Actions (RUNNER_TEMP)}"
kc="$RUNNER_TEMP/assetboard-signing.keychain-db"
secret_dir="$RUNNER_TEMP/assetboard-signing"
profile=assetboard-notary-ci

select_xcode() {
  : "${XCODE_VERSION:?Set XCODE_VERSION}"
  local app="/Applications/Xcode_${XCODE_VERSION}.app"
  if [[ ! -d "$app" ]]; then
    echo "::error::Xcode $XCODE_VERSION is not on this runner image; installed:"
    ls -d /Applications/Xcode*.app || true
    exit 1
  fi
  sudo xcode-select --switch "$app/Contents/Developer"
  xcodebuild -version
  xcrun swiftc --version
}

make_keychain() {
  local name
  for name in SIGNING_IDENTITY DEVELOPER_ID_P12_BASE64 DEVELOPER_ID_P12_PASSWORD NOTARY_KEY_P8_BASE64 NOTARY_KEY_ID NOTARY_ISSUER_ID GITHUB_ENV; do
    [[ -n "${!name:-}" ]] || { echo "::error::$name is not set (the release environment holds the signing secrets)"; exit 1; }
  done
  umask 077
  rm -rf "$secret_dir"; mkdir -p "$secret_dir"
  local password
  password="$(openssl rand -hex 24)"
  echo "::add-mask::$password"
  security delete-keychain "$kc" 2>/dev/null || true
  security create-keychain -p "$password" "$kc"
  # Unlocked for six hours, the longest a job runs.
  security set-keychain-settings -lut 21600 "$kc"
  security unlock-keychain -p "$password" "$kc"

  # The Developer ID intermediates, in case the image's system keychain lacks them (public certificates from Apple).
  local ca
  for ca in DeveloperIDG2CA DeveloperIDCA; do
    curl -fsSL --retry 3 -o "$secret_dir/$ca.cer" "https://www.apple.com/certificateauthority/$ca.cer"
    security import "$secret_dir/$ca.cer" -k "$kc" >/dev/null 2>&1 || true
  done

  printf '%s' "$DEVELOPER_ID_P12_BASE64" | base64 --decode > "$secret_dir/developer-id.p12"
  security import "$secret_dir/developer-id.p12" -k "$kc" -f pkcs12 -P "$DEVELOPER_ID_P12_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
  rm -f "$secret_dir/developer-id.p12"
  # codesign uses the key without an access prompt.
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$kc" >/dev/null
  # Searched first for codesign; notarytool is pointed at it with --keychain.
  local others
  others="$(security list-keychains -d user | xargs)"
  # shellcheck disable=SC2086
  security list-keychains -d user -s "$kc" $others

  local count
  count="$(security find-identity -v -p codesigning "$kc" | grep -cF "$SIGNING_IDENTITY" || true)"
  echo "matching Developer ID identities in the temporary keychain: $count"
  [[ "$count" -ge 1 ]] || { echo "::error::The p12 holds no valid identity named by SIGNING_IDENTITY"; exit 1; }

  local key="$secret_dir/AuthKey.p8"
  printf '%s' "$NOTARY_KEY_P8_BASE64" | base64 --decode > "$key"
  xcrun notarytool store-credentials "$profile" --key "$key" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER_ID" --keychain "$kc" >/dev/null
  rm -f "$key"
  echo "notary profile $profile stored in the temporary keychain"

  echo "NOTARY_PROFILE=$profile" >> "$GITHUB_ENV"
  echo "NOTARY_KEYCHAIN=$kc" >> "$GITHUB_ENV"
}

remove_keychain() {
  if [[ -f "$kc" ]]; then
    security delete-keychain "$kc" || rm -f "$kc"
    echo "temporary keychain deleted"
  fi
  rm -rf "$secret_dir"
}

case "${1:-}" in
  xcode) select_xcode ;;
  keychain) make_keychain ;;
  cleanup) remove_keychain ;;
  *) echo "usage: $0 xcode|keychain|cleanup" >&2; exit 2 ;;
esac
