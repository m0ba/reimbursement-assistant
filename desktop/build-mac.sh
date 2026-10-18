#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")

npx electron-builder --mac dir --x64 --arm64 --publish never

for pair in "release/mac:x64" "release/mac-arm64:arm64"; do
  dir="${pair%%:*}"
  arch="${pair##*:}"
  app=$(find "$dir" -maxdepth 1 -name "*.app" | head -1)
  if [ -z "$app" ]; then echo "app not found in $dir" >&2; exit 1; fi
  codesign --force --deep --sign - "$app"
  codesign --verify --deep --strict "$app"
  echo "ad-hoc signed: $arch ($app)"
  ditto -c -k --sequesterRsrc --keepParent "$app" "release/reimbursement-${VERSION}-mac-${arch}.zip"
done

ls -lh release
