# Phase 6: Windows CI Job + Scripts + README

## Context Links
- Parent: `plan.md` · User decision: "Add Windows job to existing CI"
- Research: `research/researcher-03-antigravity-cli-ci.md`
- Files: `.github/workflows/release.yml`, `package.json`, `README.md`

## Overview
Date: 2026-05-30 · Priority: low · Status: pending

Add a `build-windows` job to the existing tag-triggered release workflow on `windows-latest`. Uploads NSIS `.exe` (+ MSI) to the same GitHub Release alongside the macOS DMG. Update README with Windows install + dev instructions.

## Key Insights
- `windows-latest` ships MSVC, WiX (for MSI), WebView2 → native build, no cargo-xwin needed (unlike reference project's local cross-build).
- Both jobs target the same release via `softprops/action-gh-release@v1` + `tag_name`; concurrent uploads to one release are fine.
- Separate Rust cache key per OS to avoid cross-contamination.

## Requirements
### Functional
1. New job `build-windows` (runs-on `windows-latest`), parallel to `build-macos`.
2. Rust msvc target, Node 20, `npm ci`, `npm run tauri:build:windows`.
3. Upload `nsis/*-setup.exe` + `msi/*.msi`.
4. Same triggers (`push tags v*`, `workflow_dispatch`), `permissions: contents: write`.
### Non-functional
5. macOS job unchanged.
6. Build < ~20 min with cache.

## Architecture — release.yml (add job)
```yaml
  build-windows:
    permissions: { contents: write }
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: x86_64-pc-windows-msvc }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: 'src-tauri -> target'
          shared-key: 'tauri-release-win'
          cache-on-failure: true
      - run: npm ci
      - run: npm run tauri:build:windows
      - name: Upload Release Assets
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v1
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
        with:
          tag_name: ${{ github.ref_name }}
          files: |
            src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe
            src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/*.msi
```
Keep existing `build-macos` job intact. Optionally rename release `name` to drop macOS-specific wording.

## README updates
- Requirements: add "Windows 10/11" alongside macOS 13+.
- Install: add npm CLI (cross-platform) + PowerShell one-liner
  `irm https://raw.githubusercontent.com/nightwalker89/n9router-tray/main/scripts/install.ps1 | iex`.
- Development: add Windows build prereqs (Rust MSVC toolchain, VS Build Tools "Desktop development with C++", WebView2) + `npm run tauri:build:windows`.
- Build targets table: add Windows row.
- Tech stack: note Windows support.

## Related Code Files
- `.github/workflows/release.yml` (modify)
- `package.json` (script added Phase 4; ensure present)
- `README.md` (modify), `README_VN.md` (optional mirror)

## Implementation Steps
1. Append `build-windows` job.
2. Verify `tauri:build:windows` script exists (Phase 4).
3. Update README install/dev/requirements.
4. Test via `workflow_dispatch` on a branch before tagging.

## Todo
- [ ] build-windows job added
- [ ] artifact globs correct (nsis/msi paths)
- [ ] README Windows sections
- [ ] workflow_dispatch dry-run green
- [ ] Tag build uploads both macOS + Windows assets

## Success Criteria
- Tag `v*` produces a release with DMG + `*-setup.exe` (+ MSI).
- Both jobs succeed independently; macOS unaffected.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| WiX/MSI build fails on runner | Med | Low | Drop MSI from globs; ship NSIS only |
| First Windows build slow / cache miss | Certain (1st) | Low | Cached subsequently |
| Path glob mismatch (productName spaces) | Med | Med | Use wildcard `*-setup.exe`; verify actual output name |
| Two jobs race on same release | Low | Low | action-gh-release is idempotent per tag |

## Security Considerations
- Only `GITHUB_TOKEN`; no signing secrets (unsigned build — SmartScreen caveat documented).
- Workflow triggers on tags only.
- `contents: write` scoped to job.

## Next Steps
Phase 7 handles the cosmetic frontend copy + full cross-platform verification.
