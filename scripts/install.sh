#!/bin/bash
# Install n9router tray — download latest release DMG and extract to ~/.n9tray
# Usage: curl -fsSL https://raw.githubusercontent.com/nightwalker89/n9router-tray/main/scripts/install.sh | bash
set -euo pipefail

REPO="nightwalker89/n9router-tray"
INSTALL_DIR="$HOME/.n9tray"
TMP_DIR=$(mktemp -d)

info()  { echo -e "\033[1;34m[n9tray]\033[0m $*"; }
ok()    { echo -e "\033[1;32m[n9tray]\033[0m $*"; }
die()   { echo -e "\033[1;31m[n9tray]\033[0m $*" >&2; exit 1; }

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# Check macOS
[[ "$(uname)" == "Darwin" ]] || die "n9router tray is macOS only"

info "Fetching latest release from GitHub..."
RELEASE_URL="https://api.github.com/repos/${REPO}/releases/latest"
RELEASE_JSON=$(curl -fsSL "$RELEASE_URL") || die "Failed to fetch release info"

DMG_URL=$(echo "$RELEASE_JSON" | grep -o '"browser_download_url":\s*"[^"]*\.dmg"' | head -1 | cut -d'"' -f4)
[[ -n "$DMG_URL" ]] || die "No DMG found in latest release"

DMG_NAME=$(basename "$DMG_URL")
TAG=$(echo "$RELEASE_JSON" | grep -o '"tag_name":\s*"[^"]*"' | head -1 | cut -d'"' -f4)

info "Downloading $DMG_NAME ($TAG)..."
curl -fsSL -o "$TMP_DIR/$DMG_NAME" "$DMG_URL" || die "Download failed"

info "Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"

MOUNT_POINT="$TMP_DIR/dmg-mount"
hdiutil attach "$TMP_DIR/$DMG_NAME" -mountpoint "$MOUNT_POINT" -nobrowse -quiet || die "Failed to mount DMG"

APP_NAME=$(ls "$MOUNT_POINT" | grep '\.app$' | head -1)
[[ -n "$APP_NAME" ]] || { hdiutil detach "$MOUNT_POINT" -quiet; die "No .app found in DMG"; }

# Remove old version if exists
[[ -d "$INSTALL_DIR/$APP_NAME" ]] && rm -rf "$INSTALL_DIR/$APP_NAME"

cp -R "$MOUNT_POINT/$APP_NAME" "$INSTALL_DIR/"
hdiutil detach "$MOUNT_POINT" -quiet

# Remove quarantine
xattr -cr "$INSTALL_DIR/$APP_NAME" 2>/dev/null || true

ok "Installed: $INSTALL_DIR/$APP_NAME"
ok ""
ok "Launch with:"
ok "  open -a \"$INSTALL_DIR/$APP_NAME\""
ok ""
ok "Or install the CLI for easier access:"
ok "  npm i -g n9tray"
ok "  n9tray"
