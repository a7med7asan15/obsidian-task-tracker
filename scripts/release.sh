#!/usr/bin/env bash
# Bump the plugin version, then commit, tag and push it with git.
# Pushing the tag triggers .github/workflows/release.yml, which builds the
# plugin and creates the GitHub release with main.js, manifest.json and styles.css.
#
# Usage: npm run release -- [patch|minor|major|<x.y.z>]   (defaults to patch)
set -euo pipefail

cd "$(dirname "$0")/.."

BUMP="${1:-patch}"

branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$branch" == "main" ]] || { echo "Releases must be cut from main (on $branch)" >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Working tree is dirty; commit or stash first" >&2; exit 1; }

git fetch --tags origin
git pull --ff-only origin main

echo "==> Checking"
npm run typecheck
npm test
npm run build

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

echo "==> Committing and tagging $VERSION"
git add package.json package-lock.json manifest.json versions.json
git commit -m "Bump version to $VERSION"
git tag -a "$VERSION" -m "$VERSION"
git push origin main
git push origin "$VERSION"

echo "Pushed tag $VERSION; GitHub Actions will build and publish the release:"
echo "  https://github.com/a7med7asan15/obsidian-task-tracker/actions"
