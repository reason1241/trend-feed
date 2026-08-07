#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PACKAGE_DIR="$DIST_DIR/trend-feed-edge"
VERSION="$(cd "$ROOT_DIR" && node -e 'console.log(JSON.parse(require("fs").readFileSync("manifest.edge.json", "utf8")).version)')"
CHROME_VERSION="$(cd "$ROOT_DIR" && node -e 'console.log(JSON.parse(require("fs").readFileSync("manifest.json", "utf8")).version)')"
ZIP_PATH="$DIST_DIR/trend-feed-edge-v$VERSION.zip"

if [[ "$VERSION" != "$CHROME_VERSION" ]]; then
  echo "Manifest versions differ: Chrome is $CHROME_VERSION and Edge is $VERSION." >&2
  exit 1
fi

FILES=(
  "newtab.html"
  "popup.html"
)

DIRS=(
  "icons"
  "src"
)

rm -rf "$PACKAGE_DIR" "$ZIP_PATH"
mkdir -p "$PACKAGE_DIR"
cp "$ROOT_DIR/manifest.edge.json" "$PACKAGE_DIR/manifest.json"

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
