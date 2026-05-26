#!/bin/bash
set -euo pipefail

LOCAL=false
DRY_RUN=false
TAG="latest"

while [[ $# -gt 0 ]]; do
  case $1 in
    --local) LOCAL=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --tag) TAG="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION=$(node -p "require('./package.json').version")
PACK_ROOT="$ROOT/.pack"

echo "==> Preparing n9tray v${VERSION}..."
rm -rf "$PACK_ROOT"
mkdir -p "$PACK_ROOT"

cp scripts/publish/package.json "$PACK_ROOT/package.json"
cp -r bin "$PACK_ROOT/bin"
cp -r lib "$PACK_ROOT/lib"

cd "$PACK_ROOT"
node -e "const p=require('./package.json'); p.version='${VERSION}'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2)+'\n')"

NPM_ARGS=()
if [[ -f "$ROOT/.npmrc" ]]; then
  NPM_ARGS+=(--userconfig "$ROOT/.npmrc")
fi

if $DRY_RUN; then
  echo "==> Dry run..."
  npm pack --dry-run
elif $LOCAL; then
  npm pack
  TARBALL=$(ls *.tgz 2>/dev/null | head -1)
  echo "==> Packed: $PACK_ROOT/$TARBALL"
  echo "    Install locally: npm i -g $PACK_ROOT/$TARBALL"
else
  echo "==> Publishing to npm (tag: $TAG)..."
  npm publish "${NPM_ARGS[@]}" --tag "$TAG" --access public
  echo "==> Published n9tray@${VERSION}"
fi
