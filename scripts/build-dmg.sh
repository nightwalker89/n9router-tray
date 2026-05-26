#!/bin/bash
set -euo pipefail

echo "==> Ensuring Rust targets..."
rustup target add aarch64-apple-darwin x86_64-apple-darwin 2>/dev/null || true

echo "==> Building universal macOS DMG..."
npm run tauri:build:macos-universal

DMG=$(find src-tauri/target/universal-apple-darwin/release/bundle/dmg -name "*.dmg" 2>/dev/null | head -1)
if [ -n "$DMG" ]; then
  echo "==> Built: $DMG"
  echo "    Size: $(du -h "$DMG" | cut -f1)"
else
  echo "==> ERROR: No DMG found in output"
  exit 1
fi
