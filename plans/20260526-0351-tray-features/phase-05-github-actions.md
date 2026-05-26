# Phase 5: GitHub Actions Release Workflow

## Context Links

- Reference workflow: vscode-mirror-chat-panel GH Actions (tag-triggered, universal macOS build)
- Build command: `npx tauri build --target universal-apple-darwin`
- Bundle output: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg`

## Overview

Create a GitHub Actions workflow that builds a universal macOS DMG on tag push and uploads it as a GitHub Release asset. Mirrors the pattern from vscode-mirror-chat-panel.

## Key Insights

- Trigger on `push: tags: ['v*']` + `workflow_dispatch` for manual runs
- macOS runner (`macos-latest`) includes Xcode, so both arm64 and x86_64 targets work
- Rust toolchain action handles target installation
- `softprops/action-gh-release@v1` uploads assets to the tag's release
- Only needs `GITHUB_TOKEN` (auto-provided), no external secrets
- Tauri CLI is a devDependency, so `npm ci` + `npx tauri build` works

## Requirements

1. Workflow triggers on version tags (`v*`) and manual dispatch
2. Builds universal macOS DMG
3. Creates GitHub Release with DMG attached
4. Uses Rust cache for faster subsequent builds
5. Permissions: `contents: write` for release creation

## Architecture

```
Tag push (v1.0.0)
  └─ GitHub Actions (macos-latest)
       ├─ Checkout
       ├─ Install Rust toolchain + targets
       ├─ Setup Node 20
       ├─ Rust cache
       ├─ npm ci
       ├─ npx tauri build --target universal-apple-darwin
       └─ Upload DMG to GitHub Release
```

## Related Code Files

- `.github/workflows/release.yml` — new file
- `package.json` — devDependencies include `@tauri-apps/cli`
- `src-tauri/Cargo.toml` — Rust deps for cache key

## Implementation Steps

1. **Create workflow directory**:
   ```bash
   mkdir -p .github/workflows
   ```

2. **Create `.github/workflows/release.yml`**:
   ```yaml
   name: Release

   on:
     push:
       tags: ['v*']
     workflow_dispatch:

   permissions:
     contents: write

   jobs:
     build-macos:
       runs-on: macos-latest
       steps:
         - uses: actions/checkout@v4

         - name: Install Rust toolchain
           uses: dtolnay/rust-toolchain@stable
           with:
             targets: aarch64-apple-darwin,x86_64-apple-darwin

         - name: Setup Node.js
           uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: npm

         - name: Rust cache
           uses: Swatinem/rust-cache@v2
           with:
             workspaces: src-tauri

         - name: Install dependencies
           run: npm ci

         - name: Build universal DMG
           run: npx tauri build --target universal-apple-darwin

         - name: Upload to Release
           uses: softprops/action-gh-release@v1
           if: startsWith(github.ref, 'refs/tags/')
           with:
             files: |
               src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg
               src-tauri/target/universal-apple-darwin/release/bundle/macos/*.app.tar.gz
           env:
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

3. **Add release script** to package.json (convenience for tagging):
   ```json
   "release": "npm version patch && git push --follow-tags"
   ```

4. **Test with workflow_dispatch** before tagging a real release.

## Todo

- [ ] Create `.github/workflows/` directory
- [ ] Write `release.yml` workflow file
- [ ] Add `release` convenience script to package.json
- [ ] Test with `workflow_dispatch` (manual trigger)
- [ ] Tag `v0.1.0` and verify full pipeline
- [ ] Verify DMG appears in GitHub Release assets
- [ ] Verify DMG downloads and installs correctly

## Success Criteria

- Pushing tag `v*` triggers the workflow
- Workflow completes in <15 minutes
- GitHub Release is created with DMG attached
- DMG is a universal binary (arm64 + x86_64)
- Manual `workflow_dispatch` also works

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| macOS runner lacks required Xcode version | Low | High | macos-latest includes Xcode 15+, sufficient for macOS 13 target |
| Build timeout (free tier: 6h) | Low | Low | Universal build ~10-15min on GH runners |
| Rust cache miss on first run | Certain | Low | First build slower (~8min), subsequent cached |
| Tag push without matching release | Low | Low | softprops/action-gh-release creates release if missing |

## Security Considerations

- Only `GITHUB_TOKEN` used (no external secrets)
- No code signing secrets in CI (unsigned build)
- Workflow only triggers on tags (not arbitrary branches)
- `permissions: contents: write` is scoped to this workflow only
- Future: add Apple signing secrets as repository secrets for notarized builds

## Next Steps

Phase 6 uses the built DMG/app as the artifact distributed via the npm CLI package.
