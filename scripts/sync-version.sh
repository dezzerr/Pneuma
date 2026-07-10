#!/usr/bin/env bash
# Sync the project version from a git tag (e.g. v0.2.0) across all
# files that carry a version string.  Used in CI before tauri build.
set -euo pipefail

VERSION="${1#v}"  # strip leading 'v'

# --- package.json ---
jq --arg v "$VERSION" '.version = $v' package.json > tmp && mv tmp package.json

# --- package-lock.json (root version + packages[""].version) ---
jq --arg v "$VERSION" '.version = $v | .packages[""].version = $v' package-lock.json > tmp && mv tmp package-lock.json

# --- Cargo.toml (package version — first occurrence only) ---
# Use awk for portability (BSD sed on macOS doesn't support 0,/pattern/ address)
awk -v v="$VERSION" '
  !done && /^version = / { print "version = \"" v "\""; done=1; next }
  { print }
' src-tauri/Cargo.toml > tmp && mv tmp src-tauri/Cargo.toml

# --- Cargo.lock (version inside the [[package]] name = "pneuma" block) ---
awk -v v="$VERSION" '
  /^\[\[package\]\]/ { in_block=1; name="" }
  in_block && /^name = / { name=$0 }
  in_block && name ~ /"pneuma"/ && /^version = / { print "version = \"" v "\""; next }
  { print }
' src-tauri/Cargo.lock > tmp && mv tmp src-tauri/Cargo.lock

# --- tauri.conf.json ---
jq --arg v "$VERSION" '.version = $v' src-tauri/tauri.conf.json > tmp && mv tmp src-tauri/tauri.conf.json

echo "[sync-version] Set version to $VERSION across package.json, package-lock.json, Cargo.toml, Cargo.lock, tauri.conf.json"
