#!/usr/bin/env bash
# Pulls the latest template release into this repo and opens a pull request.
# Only upstream-owned files are replaced (engine/, package.json, package-lock.json);
# everything in content/ is yours and is never touched.
set -euo pipefail

UPSTREAM=$(tr -d '[:space:]' < engine/UPSTREAM)
if [[ "$UPSTREAM" != */* || "$UPSTREAM" == OWNER/* ]]; then
  echo "engine/UPSTREAM does not name a template repository (expected OWNER/REPO); nothing to update from." >&2
  exit 1
fi
if [[ "$UPSTREAM" == "${GITHUB_REPOSITORY:-}" ]]; then
  echo "This repository is the template itself, so there is nothing to update from."
  exit 0
fi

current=$(tr -d '[:space:]' < engine/VERSION)
tag=$(gh release view --repo "$UPSTREAM" --json tagName --jq .tagName)
latest=${tag#v}
if [[ "$latest" == "$current" ]]; then
  echo "Already on the latest release ($current)."
  exit 0
fi

work=$(mktemp -d)
mkdir "$work/src"
gh api "repos/$UPSTREAM/tarball/$tag" > "$work/release.tgz"
tar -xzf "$work/release.tgz" --strip-components=1 -C "$work/src"

# Replace the engine outright: syncing by size and timestamp can skip a file that changed.
rm -rf engine
cp -R "$work/src/engine" engine
cp "$work/src/package.json" "$work/src/package-lock.json" .

body="Updates the engine, preview page and tooling from **$UPSTREAM** $current → $latest. Your \`content/\` is untouched."
if ! diff -rq "$work/src/.github/workflows" .github/workflows > /dev/null 2>&1; then
  body+=$'\n\n**Workflow files changed upstream.** GitHub does not let this automation edit `.github/workflows/`, so copy them over by hand from the release: https://github.com/'"$UPSTREAM/tree/$tag/.github/workflows"
fi
body+=$'\n\nChangelog: https://github.com/'"$UPSTREAM/releases/tag/$tag"

branch="whatiiif-update-$latest"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git checkout -b "$branch"
git add -A engine package.json package-lock.json
git commit -m "Update whatiiif engine to $latest"
git push --force origin "$branch"
gh pr create --title "Update whatiiif to $latest" --body "$body" --head "$branch" || gh pr edit "$branch" --body "$body"
