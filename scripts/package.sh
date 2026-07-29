#!/usr/bin/env bash
# 配布用ZIP（Chrome Web Storeアップロード / GitHub Release添付用）を作る
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p 'JSON.parse(require("fs").readFileSync("manifest.json","utf8")).version')
OUT_DIR="dist"
OUT="drive-zip-namer-${VERSION}.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/$OUT"

zip -r "$OUT_DIR/$OUT" \
  manifest.json \
  background.js \
  content \
  popup \
  options \
  lib \
  assets \
  -x "*.DS_Store"

echo "created $OUT_DIR/$OUT"
