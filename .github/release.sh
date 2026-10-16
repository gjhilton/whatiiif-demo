#!/usr/bin/env bash
# whatiiif: template only. Releasing WhatIIIF, where the version in engine/VERSION is the one thing anyone changes:
#
#   .github/release.sh check BASE   (a pull request) a change to what sites get must raise engine/VERSION above BASE's
#   .github/release.sh release      (main) releases every version merged since the last release: the tag vX.Y.Z and the
#                                   GitHub release, at the commit the pull request that brought it left main at, its
#                                   words that pull request's description; then points the tag of the major version
#                                   (v1 for 1.x), which sites call the shared steps at, at the latest
#   .github/release.sh released     (main) fails unless everything sites get is in the release of engine/VERSION, and
#                                   the tag of its major version points at it
#   .github/release.sh point vX.Y.Z (a release made by hand, release.yml) points the tag of its major version at it, by
#                                   the rule release does: not for a pre-release, and never back from a later release
#   .github/release.sh next         the next patch version, which the weekly package update raises engine/VERSION to
#   .github/release.sh changed BASE what sites get that differs between BASE and the files as they are, on one line
#
# Run by .github/workflows/version.yml, live.yml and dependencies.yml. A version with a hyphen (1.2.0-rc.1) is a
# pre-release: released as one, it leaves the major version's tag on the last full release, as release.yml does for
# one made by hand.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../engine/ci/versions.sh"

# What sites get: everything a site made from the template starts with, runs, or is built from, but for tests and the
# README's pictures; and of the package files, what sites install, as `npm ci --omit=dev` leaves out devDependencies.
SITES=(engine ':!engine/test' ':!engine/artwork' content .gitignore .gitattributes
  .github/workflows/deploy.yml .github/workflows/update.yml .github/workflows/publish.yml .github/workflows/offer-update.yml)
PACKAGES=(package.json package-lock.json)

# engine/VERSION at commit $1 or, with no commit, as it is now: like what sites get, read from the files as they are.
version() { { if [[ -n "${1:-}" ]]; then git show "$1:engine/VERSION"; else cat engine/VERSION; fi; } | tr -d '[:space:]'; }
major() { echo "v${1%%.*}"; }
# A version as semantic versioning writes one: 1.2.0, or a pre-release such as 1.2.0-rc.1.
valid() {
  if [[ ! "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
    echo "::error title=engine/VERSION is not a version::It says \"$1\": write three numbers, such as 1.2.0, or a pre-release, such as 1.2.0-rc.1."
    exit 1
  fi
}

# Of package file $2, at commit $1 or, with no commit, as it is now, what sites install: all but devDependencies.
installed() {
  { if [[ -n "$1" ]]; then git show "$1:$2"; else cat "$2"; fi; } 2> /dev/null |
    jq -S 'del(.devDependencies) | if .packages then .packages |= with_entries(select(.value.dev != true) | .value |= del(.devDependencies)) else . end'
}
changed() {
  local base=$1 file
  {
    git diff --name-only "$base" -- "${SITES[@]}"
    for file in "${PACKAGES[@]}"; do
      [[ "$(installed "$base" "$file")" == "$(installed '' "$file")" ]] || echo "$file"
    done
  } | paste -sd ' ' -
}

# Whether version tag $1 has its GitHub release, which is what copies are offered: a tag alone is not one.
has_release() {
  local errors
  errors=$(mktemp)
  if gh release view "$1" --repo "$GITHUB_REPOSITORY" --json tagName > /dev/null 2> "$errors"; then return 0; fi
  if grep -qx 'release not found' "$errors"; then return 1; fi
  cat "$errors" >&2
  exit 1
}

# The pull request that brought commit $1 to main, as GitHub's API gives it, or {} for a commit pushed to main: GitHub
# lists every pull request that holds the commit, open ones and those into other branches too.
pull_of() {
  gh api "repos/$GITHUB_REPOSITORY/commits/$1/pulls" | jq 'map(select(.merged_at != null and .base.ref == "main")) | first // {}'
}

check() {
  local base=$1 now before differ
  now=$(version)
  before=$(version "$base")
  differ=$(changed "$base")
  if [[ "$now" == "$before" ]]; then
    if [[ -n "$differ" ]]; then
      echo "::error title=Raise engine/VERSION::This changes what sites get ($differ), so it is a new version: raise engine/VERSION above $before. Merging it releases that version."
      exit 1
    fi
    echo "Nothing sites get changes: no new version needed."
    return
  fi
  valid "$now"
  if ! above "$now" "$before"; then
    echo "::error title=engine/VERSION must go up::$now is not above $before."
    exit 1
  fi
  if git rev-parse -q --verify "refs/tags/v$now" > /dev/null; then
    echo "::error title=v$now is released already::Raise engine/VERSION above it."
    exit 1
  fi
  echo "Merging this releases $now."
}

# Releases version $1, which commit $2 brought to main, unless it has its release already: at the commit its pull
# request left main at, whichever way it was merged (by rebasing, that is after the commit that raised engine/VERSION),
# or with no pull request, at $3, main's last commit before the next version.
release_one() {
  local now=$1 sha=$2 target=$3 pr merged notes args
  if has_release "v$now"; then return; fi
  pr=$(pull_of "$sha")
  merged=$(jq -r '.merge_commit_sha // empty' <<< "$pr")
  if [[ -n "$merged" ]] && git merge-base --is-ancestor "$merged" HEAD 2> /dev/null; then target=$merged; fi
  # The release's words: the pull request's description, without the line naming the tool that wrote it. GitHub's own
  # list of what changed if there is none, or it is Dependabot's, which is written for whoever merges it.
  notes=$(mktemp)
  jq -r 'if .user.login == "dependabot[bot]" then "" else .body // "" end' <<< "$pr" | { grep -v 'Generated with \[Claude Code\]' || true; } > "$notes"
  args=(release create "v$now" --target "$target" --title "WhatIIIF $now")
  if grep -q '[^[:space:]]' "$notes"; then args+=(--notes-file "$notes"); else args+=(--generate-notes); fi
  if prerelease "$now"; then args+=(--prerelease); fi
  gh "${args[@]}"
  echo "Released $now at $target."
}

# Points the tag sites call, of version $1's major version, at its release, unless that is a pre-release, is not
# released, or the tag is on a later release already. For a release made on merging, release does it: one made with
# the workflow's own token starts no workflow. For one made by hand, release.yml does, with point.
point_major() {
  local now=$1 tag at
  tag=$(major "$now")
  if prerelease "$now" || ! has_release "v$now"; then return; fi
  git fetch -q -f origin "refs/tags/v$now:refs/tags/v$now"
  at=$(git ls-remote --tags origin "refs/tags/$tag" | cut -f1)
  [[ "$at" == "$(git rev-parse "v$now^{commit}")" ]] && return
  if [[ -n "$at" ]]; then
    # Fetched first, and not as part of the test below, so that if it fails the run stops rather than moves the tag.
    git fetch -q -f origin "refs/tags/$tag:refs/tags/$tag"
    if above "$(version "$tag")" "$now"; then return; fi
  fi
  git tag -f "$tag" "v$now^{commit}" > /dev/null
  if ! git push -q -f origin "refs/tags/$tag"; then
    echo "::error title=$tag still points at the previous release::Copies run the steps at $tag, so move it by hand: git fetch --tags && git tag -f $tag v$now && git push -f origin refs/tags/$tag"
    exit 1
  fi
  echo "$tag points at $now."
}

point() {
  local now=${1#v}
  valid "$now"
  point_major "$now"
}

release() {
  # Live can be run by hand on any branch; a release is of main.
  if [[ "${GITHUB_REF:-refs/heads/main}" != refs/heads/main ]]; then
    echo "Releases are made from main: this is $GITHUB_REF."
    return
  fi
  local now since before= commits=() each end i head
  now=$(version)
  valid "$now"
  head=$(git rev-parse HEAD)
  has_release "v$now" && before=yes
  # Every commit on main since the last release that changed engine/VERSION, oldest first: Live keeps only the latest
  # of the runs waiting for it, so one run may find several versions merged since the last. With no release before,
  # just this one.
  since=$(git describe --tags --abbrev=0 --first-parent --match 'v[0-9]*.[0-9]*.[0-9]*' HEAD 2> /dev/null || true)
  if [[ -n "$since" ]]; then
    # The last release first, so a run that stopped before moving its major version's tag is finished by the next.
    point_major "$(version "$since")"
    commits=($(git rev-list --reverse --first-parent "$since..HEAD" -- engine/VERSION))
  fi
  for ((i = 0; i < ${#commits[@]}; i++)); do
    each=$(version "${commits[i]}")
    valid "$each"
    if ((i + 1 < ${#commits[@]})); then end=$(git rev-parse "${commits[i + 1]}^1"); else end=$head; fi
    release_one "$each" "${commits[i]}" "$end"
    point_major "$each"
  done
  release_one "$now" "$head" "$head"
  point_major "$now"
  if [[ -n "$before" ]]; then echo "$now is released already."; else echo "$now is released."; fi
}

released() {
  local now tag differ
  now=$(version)
  valid "$now"
  tag="v$now"
  git fetch -q --tags --force origin
  if ! git rev-parse -q --verify "refs/tags/$tag" > /dev/null || ! has_release "$tag"; then
    echo "::error title=$now is not released::engine/VERSION says $now, which has no GitHub release, so copies are not offered it: Live's release job should have made it."
    exit 1
  fi
  if ! prerelease "$now" && [[ "$(git rev-parse "$(major "$now")^{commit}" 2> /dev/null)" != "$(git rev-parse "$tag^{commit}")" ]]; then
    echo "::error title=$(major "$now") is not on $tag::Sites call the shared steps at $(major "$now"), so it must point at the release of main's engine/VERSION, $tag."
    exit 1
  fi
  differ=$(changed "$tag")
  if [[ -n "$differ" ]]; then
    echo "::error title=main is ahead of $tag::$differ changed since $now was released, without a new version: raise engine/VERSION."
    exit 1
  fi
  if prerelease "$now"; then
    echo "Everything sites get on main is in $now, a pre-release: $(major "$now"), which sites call, stays on the last full release."
  else
    echo "Everything sites get on main is in $now, and $(major "$now") points at it."
  fi
}

# The next patch version: 1.1.0 → 1.1.1; of a pre-release, the next pre-release of the same version: 1.2.0-rc.1 →
# 1.2.0-rc.2, 1.2.0-beta → 1.2.0-beta.1.
next() {
  local now last
  now=$(version)
  valid "$now"
  last=${now##*[.-]}
  if ! prerelease "$now"; then
    echo "${now%.*}.$((10#$last + 1))"
  elif [[ "$last" =~ ^[0-9]+$ ]]; then
    echo "${now%"$last"}$((10#$last + 1))"
  else
    echo "$now.1"
  fi
}

"$@"
