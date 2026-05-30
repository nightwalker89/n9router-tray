# Research 03 — Antigravity on Windows + CLI/CI Distribution

## Antigravity install paths (VS Code fork)
Antigravity is an Electron / VS Code fork. Windows VS Code-family install layout:

| Install type | Path |
|--------------|------|
| User (default) | `%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe` |
| System (all users) | `C:\Program Files\Antigravity\Antigravity.exe` |
| CLI shim | `...\Antigravity\bin\antigravity.cmd` (and `antigravity` no-ext) |
| Resources | `...\Antigravity\resources\app\` (asar at `resources\app.asar`) |

AGY IDE (separate product) likely: `%LOCALAPPDATA%\Programs\Antigravity IDE\Antigravity IDE.exe`.

### v1 / v2 / IDE distinction (macOS analog → Windows)
macOS logic:
- v1: `app/bin/antigravity` exists
- v2: `app.asar` exists AND `app/bin/antigravity` does NOT
- IDE: separate `.app`

Windows mapping (best-effort, NEEDS USER CONFIRMATION):
- v1: `...\Antigravity\resources\app\bin\antigravity.cmd` (or `app\bin\`) exists
- v2: `...\Antigravity\resources\app.asar` exists AND no `app\bin\antigravity*`
- IDE: `...\Antigravity IDE\Antigravity IDE.exe` exists

`bundle_term` (macOS used `Antigravity.app/Contents/MacOS` for pgrep): Windows analog = match `exe()` path containing `Antigravity\Antigravity.exe` (or `Antigravity IDE\`). Launch binary = the `.exe` directly (avoids `.cmd` console window).

> OPEN: exact folder names + whether v1/v2 coexist in same dir on Windows. Code defaults provided; confirm before shipping.

## CLI (`n9tray` npm package)
Current: macOS-only — `open -a "/Applications/n9router tray.app"`, installs via DMG (`hdiutil`).

Cross-platform plan:
- `bin/n9tray.js`: branch on `process.platform`.
  - darwin: unchanged (`open -a`).
  - win32: resolve exe at `%LOCALAPPDATA%\Programs\n9router tray\n9router tray.exe` (NSIS perUser default) with fallback `C:\Program Files\n9router tray\...`; launch via `child_process.spawn(exe, {detached:true})` or `start "" "<exe>"`.
- `lib/installer.js`: add win32 branch — pick `.exe` asset from latest GitHub release, download to `os.tmpdir()`, run NSIS silently `installer.exe /S` (perUser, no admin) then locate installed exe. macOS DMG path unchanged.
- `scripts/publish/package.json`: `"os": ["darwin"]` → `["darwin","win32"]`. Keep single package (`n9tray`) serving both OSes; bin script self-detects.

## CI / release
Current `release.yml`: single `build-macos` job (universal DMG) on tag `v*`.

Add `build-windows` job (per user answer "Add Windows job to existing CI"):
- `runs-on: windows-latest` (has MSVC, WiX, WebView2).
- `dtolnay/rust-toolchain@stable` target `x86_64-pc-windows-msvc`.
- `actions/setup-node@v4` node 20, `npm ci`.
- `swatinem/rust-cache@v2` (separate `shared-key: tauri-release-win`).
- Build: `npm run tauri:build:windows` (`tauri build --target x86_64-pc-windows-msvc`).
- Upload artifacts to same release: NSIS at `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe`, MSI at `.../bundle/msi/*.msi`.
- Both jobs use same `softprops/action-gh-release@v1` with `tag_name`.

Reference project (`vscode-mirror-chat-panel`) demonstrates Windows Tauri builds (cargo-xwin locally; native `windows-latest` in CI is simpler — no xwin needed since we run on Windows).

## One-liner install (README)
- macOS: existing `curl ... install.sh | bash`.
- Windows: add `scripts/install.ps1` → `irm <raw>/install.ps1 | iex`; fetch latest release `.exe`, run `/S`.

## Risks
- NSIS silent `/S` perUser vs perMachine path mismatch → CLI must probe both locations.
- Unsigned `.exe` → SmartScreen "unknown publisher". Same posture as unsigned macOS. Out of scope.
- AGY path guesses wrong → Launch/Quit no-op; mitigated by runtime path probing of multiple candidates + `installed:false` if none found.

## References
- VS Code Windows install layout, Tauri NSIS bundle docs, GitHub Actions `windows-latest` image, reference project CI.
