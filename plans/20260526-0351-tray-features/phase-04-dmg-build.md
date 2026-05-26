# Phase 4: macOS Universal DMG Build

## Context Links

- Build script: `package.json` → `tauri:build:macos-universal`
- Tauri config: `src-tauri/tauri.conf.json` — bundle targets `["dmg", "app"]`
- Rust edition: 2021, min macOS 13.0

## Overview

Document and verify the existing universal DMG build pipeline. The build command already exists in package.json. This phase ensures it works end-to-end and adds any missing pieces for CI consumption.

## Key Insights

- `npm run tauri:build:macos-universal` already runs `tauri build --target universal-apple-darwin`
- Requires both Rust targets installed: `aarch64-apple-darwin` + `x86_64-apple-darwin`
- Tauri 2 produces DMG at `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`
- Bundle identifier: `com.n9router.tray`
- No code signing configured yet (unsigned DMG works for personal use)
- Release profile already optimized: strip, LTO, codegen-units=1, panic=abort

## Requirements

1. Verify both Rust targets are installable via rustup
2. Ensure build produces a valid universal binary DMG
3. Add a convenience wrapper script for local builds
4. Document the output path for CI consumption
5. Optionally add version stamping from package.json

## Architecture

```
npm run tauri:build:macos-universal
  └─ tauri build --target universal-apple-darwin
       └─ vite build (frontend)
       └─ cargo build --release --target aarch64-apple-darwin
       └─ cargo build --release --target x86_64-apple-darwin
       └─ lipo → universal binary
       └─ bundle → .app + .dmg
       └─ Output: src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg
```

## Related Code Files

- `package.json` — build scripts (lines 13-17)
- `src-tauri/tauri.conf.json` — bundle config
- `src-tauri/Cargo.toml` — release profile (lines 33-37)

## Implementation Steps

1. **Verify Rust targets** (one-time setup):
   ```bash
   rustup target add aarch64-apple-darwin x86_64-apple-darwin
   ```

2. **Test build locally**:
   ```bash
   npm run tauri:build:macos-universal
   ```

3. **Add build wrapper script** `scripts/build-dmg.sh`:
   ```bash
   #!/bin/bash
   set -euo pipefail

   # Ensure targets
   rustup target add aarch64-apple-darwin x86_64-apple-darwin 2>/dev/null || true

   # Build
   npm run tauri:build:macos-universal

   # Report output
   DMG=$(find src-tauri/target/universal-apple-darwin/release/bundle/dmg -name "*.dmg" | head -1)
   echo "Built: $DMG"
   echo "Size: $(du -h "$DMG" | cut -f1)"
   ```

4. **Add script to package.json**:
   ```json
   "build:dmg": "bash scripts/build-dmg.sh"
   ```

5. **Version stamping** (optional): Tauri reads version from `tauri.conf.json` > `version` field. Ensure it matches `package.json` version, or add a pre-build step to sync them.

## Todo

- [ ] Verify both Rust targets install cleanly
- [ ] Run full universal build locally, confirm DMG output
- [ ] Create `scripts/build-dmg.sh` wrapper
- [ ] Add `build:dmg` script to package.json
- [ ] Verify DMG installs correctly on both Intel and Apple Silicon
- [ ] Document output path for Phase 5 (CI)

## Success Criteria

- `npm run build:dmg` produces a universal DMG
- DMG contains a `.app` that runs on both arm64 and x86_64
- `file` command on the binary shows "Mach-O universal binary with 2 architectures"
- App launches correctly from DMG on macOS 13+

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Build fails on CI (missing Xcode tools) | Medium | Medium | Phase 5 will install Xcode CLI tools |
| Universal build doubles compile time | Certain | Low | Acceptable for release builds |
| Unsigned DMG triggers Gatekeeper | Certain | Low | Users right-click > Open; signing is future work |

## Security Considerations

- No code signing in this phase (personal/internal distribution)
- DMG is not notarized — macOS will show "unidentified developer" warning
- Future: add Apple Developer ID signing + notarization for public distribution

## Next Steps

Phase 5 uses this build in GitHub Actions to produce release artifacts automatically.
