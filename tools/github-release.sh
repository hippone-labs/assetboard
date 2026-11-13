#!/bin/bash
# Publishes the GitHub Release vX.Y.Z of hippone-labs/assetboard: the release notes, the notarized files the site offers, and SHA256SUMS.txt.
# release-app runs it last with GH_TOKEN set to the run's token; after a release by hand, run it with your own gh login:
#   tools/github-release.sh 2026.11.11 notes.md Assetboard-macOS-arm64-2026.11.11.dmg Assetboard-macOS-arm64-2026.11.11.zip SHA256SUMS.txt
# Running it again for the same version replaces the notes and the files. A missing tag is created at the checked-out commit.
set -euo pipefail
(( $# >= 3 )) || { echo "usage: $0 <version> <notes.md> <file>..." >&2; exit 2; }
version=$1 notes=$2; shift 2
repo=${GITHUB_RELEASE_REPO:-hippone-labs/assetboard}
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Not a version: $version" >&2; exit 2; }
test -s "$notes" || { echo "No release notes: $notes" >&2; exit 2; }
for file in "$@"; do
  test -s "$file" || { echo "Missing file: $file" >&2; exit 2; }
  base=$(basename "$file")
  if [[ $base != SHA256SUMS.txt && $base != *"-$version".* ]]; then
    echo "Not a $version file: $file" >&2; exit 2
  fi
done

tag="v$version"
if gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
  gh release edit "$tag" --repo "$repo" --title "Assetboard $version" --notes-file "$notes" --latest
  gh release upload "$tag" --repo "$repo" --clobber "$@"
else
  gh release create "$tag" --repo "$repo" --title "Assetboard $version" --notes-file "$notes" --latest \
    --target "$(git rev-parse HEAD)" "$@"
fi
echo "https://github.com/$repo/releases/tag/$tag"
