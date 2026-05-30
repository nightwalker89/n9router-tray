#!/usr/bin/env bash
# Local Windows cross-build for n9router-tray using cargo-xwin (macOS/Linux host).
#
# Produces a runnable portable .exe for quick testing WITHOUT GitHub Actions.
# Full NSIS/MSI installers still come from the `build-windows` CI job (WiX/MSI
# is Windows-only), so this script uses --no-bundle and stages a portable zip.
#
# Usage:
#   bash scripts/build-windows-xwin.sh            # release
#   bash scripts/build-windows-xwin.sh --debug    # debug build (faster)
#
# Prerequisites:
#   - cargo-xwin            : cargo install cargo-xwin
#   - LLVM (clang-cl,llvm-rc): brew install llvm
#   - Rust target          : rustup target add x86_64-pc-windows-msvc

set -euo pipefail

TARGET="x86_64-pc-windows-msvc"
BUILD_MODE="release"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug) BUILD_MODE="debug"; shift ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/build-windows-xwin.sh [--debug]
  Cross-builds a portable Windows .exe via cargo-xwin (target: x86_64-pc-windows-msvc).
  Output: src-tauri/target/<target>/<profile>/n9router-tray.exe
          artifacts/windows-xwin-portable/  (+ .zip)
EOF
      exit 0 ;;
    *) echo "ERROR: Unknown argument '$1'"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: Required command not found: $1"; exit 1; }
}
require_cmd npm
require_cmd node
require_cmd cargo
require_cmd zip

if ! cargo xwin --version >/dev/null 2>&1; then
  echo "ERROR: cargo-xwin is required. Install with: cargo install cargo-xwin"
  exit 1
fi

# cargo-xwin compiles C deps (e.g. ring) with clang-cl and needs llvm-rc for the
# Windows resource (.rc) step. Make sure the LLVM bin dir is on PATH and RC is set.
ensure_llvm() {
  local candidate
  for candidate in \
    "/opt/homebrew/opt/llvm/bin" \
    "/usr/local/opt/llvm/bin"
  do
    if [[ -x "${candidate}/llvm-rc" ]]; then
      export PATH="${candidate}:${PATH}"
      break
    fi
  done

  command -v clang-cl >/dev/null 2>&1 || {
    echo "ERROR: clang-cl not found. Install LLVM: brew install llvm"; exit 1; }
  command -v llvm-rc >/dev/null 2>&1 || {
    echo "ERROR: llvm-rc not found. Install LLVM: brew install llvm"; exit 1; }
  export RC="$(command -v llvm-rc)"
}
ensure_llvm
echo "==> clang-cl: $(command -v clang-cl)"
echo "==> RC (llvm-rc): ${RC}"

cd "${PROJECT_ROOT}"

if [[ ! -d node_modules ]]; then
  echo "==> Installing dependencies..."
  npm install
fi

# tauri build runs the configured beforeBuildCommand (vite build) automatically.
echo "==> Cross-building Windows binary via cargo-xwin (${BUILD_MODE})..."
TAURI_ARGS=( "build" "--runner" "cargo-xwin" "--target" "${TARGET}" "--no-bundle" "--ci" )
[[ "${BUILD_MODE}" == "debug" ]] && TAURI_ARGS+=( "--debug" )

npm run tauri -- "${TAURI_ARGS[@]}"

PROFILE_DIR="release"
[[ "${BUILD_MODE}" == "debug" ]] && PROFILE_DIR="debug"
RUNTIME_DIR="${PROJECT_ROOT}/src-tauri/target/${TARGET}/${PROFILE_DIR}"

# Resolve the app exe (cargo package name = n9router-tray).
APP_BIN_NAME="$(awk -F '"' '/^name = "/ { print $2; exit }' "${PROJECT_ROOT}/src-tauri/Cargo.toml")"
APP_EXE="${RUNTIME_DIR}/${APP_BIN_NAME}.exe"
if [[ ! -f "${APP_EXE}" ]]; then
  APP_EXE="$(find "${RUNTIME_DIR}" -maxdepth 1 -type f -name '*.exe' ! -name 'build-script*' | head -n 1 || true)"
fi
[[ -n "${APP_EXE}" && -f "${APP_EXE}" ]] || {
  echo "ERROR: Could not find built .exe in ${RUNTIME_DIR}"; exit 1; }

# Stage a portable folder. n9router-tray has no sidecar; WebView2Loader.dll is
# embedded by Tauri, so the single .exe is self-contained (WebView2 runtime is
# present on Windows 10/11 by default, else installed by the NSIS bootstrapper).
PORTABLE_DIR="${PROJECT_ROOT}/artifacts/windows-xwin-portable"
echo "==> Staging portable artifact at ${PORTABLE_DIR}"
rm -rf "${PORTABLE_DIR}"
mkdir -p "${PORTABLE_DIR}"
cp "${APP_EXE}" "${PORTABLE_DIR}/"
# Copy WebView2Loader.dll too if the toolchain emitted one alongside the exe.
[[ -f "${RUNTIME_DIR}/WebView2Loader.dll" ]] && cp "${RUNTIME_DIR}/WebView2Loader.dll" "${PORTABLE_DIR}/"

APP_VERSION="$(node -p "require('./package.json').version")"
ZIP_PATH="${PROJECT_ROOT}/artifacts/n9router-tray-windows-portable-v${APP_VERSION}.zip"
echo "==> Creating zip: $(basename "${ZIP_PATH}")"
rm -f "${ZIP_PATH}"
(cd "${PORTABLE_DIR}" && zip -r "${ZIP_PATH}" .)

echo ""
echo "✅ Windows xwin build complete."
echo "App executable:  ${APP_EXE}"
echo "Portable folder: ${PORTABLE_DIR}"
echo "Zip artifact:    ${ZIP_PATH}"
echo ""
echo "NOTE: Run the .exe on a Windows 10/11 machine (or VM) to test."
echo "      Full NSIS/MSI installers are produced by the build-windows CI job."
