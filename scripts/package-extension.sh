#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PACKAGE_DIR="$DIST_DIR/trend-feed"
VERSION="$(cd "$ROOT_DIR" && node -e 'console.log(JSON.parse(require("fs").readFileSync("manifest.json", "utf8")).version)')"
ZIP_PATH="$DIST_DIR/trend-feed-v$VERSION.zip"

FILES=(
  "manifest.json"
  "newtab.html"
  "popup.html"
)

DIRS=(
  "icons"
  "src"
)

rm -rf "$PACKAGE_DIR" "$ZIP_PATH"
mkdir -p "$PACKAGE_DIR"

for file in "${FILES[@]}"; do
  cp "$ROOT_DIR/$file" "$PACKAGE_DIR/$file"
done

for dir in "${DIRS[@]}"; do
  mkdir -p "$PACKAGE_DIR/$dir"
  rsync -a \
    --exclude ".DS_Store" \
    "$ROOT_DIR/$dir/" \
    "$PACKAGE_DIR/$dir/"
done

(
  cd "$PACKAGE_DIR"
  zip -qr "$ZIP_PATH" .
)

echo "Created $ZIP_PATH"
