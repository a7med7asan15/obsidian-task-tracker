#!/usr/bin/env bash
# Cut a new GitHub release that Obsidian (and BRAT) can install from.
#
# Usage: npm run release -- [patch|minor|major|<x.y.z>] ["release notes"]
#   defaults to "patch"; notes default to the commit subjects since the last tag.
set -euo pipefail

cd "$(dirname "$0")/.."

BUMP="${1:-patch}"
NOTES="${2:-}"

command -v gh >/dev/null || { echo "gh CLI is required" >&2; exit 1; }

branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$branch" == "main" ]] || { echo "Releases must be cut from main (on $branch)" >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Working tree is dirty; commit or stash first" >&2; exit 1; }

git fetch --tags origin
git pull --ff-only origin main

echo "==> Checking"
npm run typecheck
npm test
npm run build

prev_tag="$(git describe --tags --abbrev=0 2>/dev/null || true)"

echo "==> Bumping version ($BUMP)"
npm version "$BUMP" --no-git-tag-version >/dev/null
VERSION="$(node -p "require('./package.json').version")"

if git rev-parse -q --verify "refs/tags/$VERSION" >/dev/null; then
  echo "Tag $VERSION already exists" >&2
  git checkout -- package.json package-lock.json
  exit 1
fi

# Sync manifest.json and versions.json with the new version.
node -e '
const fs = require("fs");
const v = process.argv[1];
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
manifest.version = v;
fs.writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
versions[v] = manifest.minAppVersion;
fs.writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
' "$VERSION"

# Rebuild so main.js is produced from the bumped tree.
npm run build

if [[ -z "$NOTES" ]]; then
  range="${prev_tag:+$prev_tag..}HEAD"
  NOTES="$(git log --pretty='- %s' "$range")"
  [[ -n "$NOTES" ]] || NOTES="Release $VERSION"
fi

echo "==> Committing and tagging $VERSION"
git add package.json package-lock.json manifest.json versions.json
git commit -m "Bump version to $VERSION"
git tag -a "$VERSION" -m "$VERSION"
git push origin main
git push origin "$VERSION"

echo "==> Creating GitHub release $VERSION"
gh release create "$VERSION" main.js manifest.json styles.css \
  --title "$VERSION" \
  --notes "$NOTES"

echo "Released $VERSION"
