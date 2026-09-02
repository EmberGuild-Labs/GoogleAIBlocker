#!/usr/bin/env bash
# Builds dist/google-ai-blocker-<version>.zip, ready to upload to the
# Chrome Web Store. Only the files the extension actually needs are included.
set -euo pipefail

cd "$(dirname "$0")/.."
version="$(node -p "require('./manifest.json').version")"
out="dist/google-ai-blocker-${version}.zip"

node tools/build-manifest.mjs --check

mkdir -p dist
rm -f "$out"
zip -r -q "$out" \
  manifest.json \
  rules \
  src \
  icons \
  LICENSE \
  -x '*.DS_Store'

echo "wrote $out"
unzip -l "$out" | tail -n 1
