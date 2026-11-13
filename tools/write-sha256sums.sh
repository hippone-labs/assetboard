#!/bin/bash
# Writes SHA256SUMS.txt for the notarized GitHub Release files (the .dmg and the .zip), in the
# same form as `shasum -a 256`: the hash, two spaces, the file's name with no path. It then
# checks the file with `shasum -a 256 -c`. release-app.yml runs this after packaging; after a
# release by hand:
#   tools/write-sha256sums.sh "$RELEASE_DIR" Assetboard-macOS-arm64-2026.11.11.dmg Assetboard-macOS-arm64-2026.11.11.zip
set -euo pipefail
(( $# >= 2 )) || { echo "usage: $0 <directory> <file>..." >&2; exit 2; }
dir=$1; shift
cd "$dir"
for file in "$@"; do
  [[ $file == */* ]] && { echo "Give file names, not paths: $file" >&2; exit 2; }
  test -s "$file" || { echo "Missing file: $file" >&2; exit 2; }
done
tmp=$(mktemp ./SHA256SUMS.txt.XXXXXX)
trap 'rm -f "$tmp"' EXIT
shasum -a 256 "$@" > "$tmp"
while IFS= read -r line; do
  [[ $line =~ ^[0-9a-f]{64}"  "[^/]+$ ]] || { echo "Unexpected shasum line: $line" >&2; exit 2; }
done < "$tmp"
mv "$tmp" SHA256SUMS.txt
trap - EXIT
shasum -a 256 -c SHA256SUMS.txt
