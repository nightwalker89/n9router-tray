# Research: DMG Build, GH Actions, CLI Patterns

## macOS Universal DMG Build (from vscode-mirror-chat-panel)

**Scripts in package.json:**
```
tauri:build:macos-universal: tauri build --target universal-apple-darwin
tauri:build:macos-arm: tauri build --target aarch64-apple-darwin
tauri:build:macos-x64: tauri build --target x86_64-apple-darwin
```

**Rust targets needed:** `aarch64-apple-darwin` + `x86_64-apple-darwin`
Install: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`

**Bundle config (tauri.conf.json):**
```json
"bundle": { "active": true, "targets": ["dmg", "app"], "macOS": { "minimumSystemVersion": "13.0" } }
```

**n9router-tray already has:** `tauri:build:macos-universal` script in package.json. No changes needed for the script itself.

---

## GitHub Actions Release Workflow (from vscode-mirror-chat-panel)

**Trigger:** `push: tags: ['v*']` + `workflow_dispatch`

**Key steps:**
1. `actions/checkout@v4`
2. `dtolnay/rust-toolchain@stable` with targets `aarch64-apple-darwin,x86_64-apple-darwin`
3. `actions/setup-node@v4` (node 20)
4. `swatinem/rust-cache@v2` (workspaces: `src-tauri -> target`)
5. `npm ci` + build frontend
6. `npx tauri build --target universal-apple-darwin`
7. `softprops/action-gh-release@v1` to upload DMG

**Permissions:** `contents: write`
**Secrets:** Only `GITHUB_TOKEN` (auto-provided)
**Matrix:** macOS-only for universal build

---

## n9router CLI npm Publish Patterns

**package.json:**
```json
{ "name": "n9router", "bin": { "n9router": "./bin/n9router.js" } }
```

**Scripts:**
```
publish:npm: ./scripts/publish-npm.sh
publish:npm:local: ./scripts/publish-npm.sh --local
publish:npm:dry: ./scripts/publish-npm.sh --dry-run
publish:npm:next: ./scripts/publish-npm.sh --tag next
```

**publish-npm.sh pattern:**
- Accepts `--local`, `--dry-run`, `--tag <tag>` flags
- Reads `.npmrc` for auth token
- Builds app, creates a `pack_root/` with bin + app + package.json
- Stamps version into package.json
- `npm pack` then `npm publish` (or `npm install -g` for local)

**.npmrc:**
```
//registry.npmjs.org/:_authToken=npm_xxxxx
```

**bin/n9router.js:** Node.js entry that starts the bundled Next.js standalone server. Supports `--version` and `--update` flags.

---

## Current n9router-tray Settings State

**Store:** Uses `tauri-plugin-store` with `tray-settings.json`
**Existing tray setting:** `autoStartN9router` (auto-start n9router on tray launch) - already implemented!
**Settings UI:** Section A "Tray" has the toggle already.

**Tauri config:** identifier `com.n9router.tray`, productName `n9router Tray`
**Cargo deps:** No `tauri-plugin-autostart` yet. Has: tauri 2, positioner, shell, http, store, libc, once_cell.
