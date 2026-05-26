# Phase 6: n9tray CLI npm Package

## Context Links

- Reference: n9router CLI (`publish-npm.sh`, `bin/n9router.js`)
- n9router publish script: accepts `--local`, `--dry-run`, `--tag` flags
- n9router bin entry: Node.js script that starts bundled server
- GitHub Release: Phase 5 produces DMG artifact

## Overview

Create an npm-distributable CLI package (`n9tray`) that downloads/installs the n9router-tray macOS app. Users run `npx n9tray` or `npm i -g n9tray` to get the tray app without manually downloading the DMG.

## Key Insights

- Mirror n9router's publish pattern: `scripts/publish-npm.sh` + `bin/` entry point
- The CLI should download the `.app` from GitHub Releases (not bundle the binary in npm)
- On first run: download latest release → extract to `~/.n9tray/` → launch
- Subsequent runs: just launch the installed app (check for updates optionally)
- npm package is tiny (just the CLI script), actual binary fetched at runtime
- Alternative: bundle the .app in the npm tarball (simpler but larger package ~50MB)

## Requirements

1. Create `scripts/publish-npm.sh` mirroring n9router pattern
2. Create `scripts/publish/package.json` for the published npm package
3. Create `bin/n9tray.js` CLI entry point
4. CLI commands: `n9tray` (launch), `n9tray --install`, `n9tray --update`, `n9tray --version`
5. Add `.npmrc` for registry auth
6. Add `publish:npm` and `publish:npm:local` scripts to root package.json

## Architecture

```
npm package (n9tray)
  ├─ bin/n9tray.js          ← CLI entry point
  ├─ lib/installer.js       ← Download + extract logic
  └─ package.json           ← name: "n9tray", bin: { n9tray: "./bin/n9tray.js" }

Runtime flow:
  npx n9tray
    └─ Check ~/.n9tray/n9router tray.app exists?
         ├─ YES → open -a ~/.n9tray/n9router tray.app
         └─ NO  → Download from GitHub Release → extract → launch

Publish flow:
  scripts/publish-npm.sh
    └─ Stamp version from root package.json
    └─ Copy bin/ + lib/ to pack_root/
    └─ npm pack / npm publish
```

## Related Code Files

- `bin/n9tray.js` — new CLI entry (to create)
- `lib/installer.js` — new download/extract logic (to create)
- `scripts/publish-npm.sh` — new publish script (to create)
- `scripts/publish/package.json` — npm package manifest (to create)
- `package.json` — add publish scripts
- `.npmrc` — registry auth token (to create, gitignored)

## Implementation Steps

1. **Create directory structure**:
   ```bash
   mkdir -p bin lib scripts/publish
   ```

2. **Create `bin/n9tray.js`**:
   ```js
   #!/usr/bin/env node
   const { execSync } = require('child_process');
   const path = require('path');
   const fs = require('fs');

   const APP_DIR = path.join(require('os').homedir(), '.n9tray');
   const APP_PATH = path.join(APP_DIR, 'n9 Control.app');

   const args = process.argv.slice(2);

   if (args.includes('--version') || args.includes('-v')) {
     console.log(require('../package.json').version);
     process.exit(0);
   }

   if (args.includes('--update') || args.includes('--install') || !fs.existsSync(APP_PATH)) {
     require('../lib/installer').install().then(() => launch());
   } else {
     launch();
   }

   function launch() {
     execSync(`open -a "${APP_PATH}"`, { stdio: 'inherit' });
   }
   ```

3. **Create `lib/installer.js`**:
   ```js
   const https = require('https');
   const fs = require('fs');
   const path = require('path');
   const { execSync } = require('child_process');
   const os = require('os');

   const REPO = 'nightwalker8x/n9router-tray';
   const APP_DIR = path.join(os.homedir(), '.n9tray');

   async function install() {
     console.log('Fetching latest release...');
     const release = await fetchLatestRelease();
     const dmgAsset = release.assets.find(a => a.name.endsWith('.dmg'));
     if (!dmgAsset) throw new Error('No DMG found in latest release');

     const dmgPath = path.join(os.tmpdir(), dmgAsset.name);
     await download(dmgAsset.browser_download_url, dmgPath);

     console.log('Installing...');
     fs.mkdirSync(APP_DIR, { recursive: true });

     // Mount DMG, copy .app, unmount
     const mountPoint = '/tmp/n9tray-dmg';
     execSync(`hdiutil attach "${dmgPath}" -mountpoint "${mountPoint}" -nobrowse -quiet`);
     try {
       const appName = fs.readdirSync(mountPoint).find(f => f.endsWith('.app'));
       execSync(`cp -R "${mountPoint}/${appName}" "${APP_DIR}/"`);
     } finally {
       execSync(`hdiutil detach "${mountPoint}" -quiet`);
       fs.unlinkSync(dmgPath);
     }
     console.log('Installed to', APP_DIR);
   }

   module.exports = { install };
   ```

4. **Create `scripts/publish/package.json`**:
   ```json
   {
     "name": "n9tray",
     "version": "0.0.0",
     "description": "n9router tray app installer and launcher for macOS",
     "bin": { "n9tray": "./bin/n9tray.js" },
     "os": ["darwin"],
     "engines": { "node": ">=18" },
     "repository": { "type": "git", "url": "https://github.com/nightwalker8x/n9router-tray" },
     "license": "MIT",
     "author": "cuongquach"
   }
   ```

5. **Create `scripts/publish-npm.sh`**:
   ```bash
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

   VERSION=$(node -p "require('./package.json').version")
   PACK_ROOT="$(pwd)/.pack"

   rm -rf "$PACK_ROOT"
   mkdir -p "$PACK_ROOT"

   # Copy package files
   cp scripts/publish/package.json "$PACK_ROOT/package.json"
   cp -r bin "$PACK_ROOT/bin"
   cp -r lib "$PACK_ROOT/lib"

   # Stamp version
   cd "$PACK_ROOT"
   node -e "const p=require('./package.json'); p.version='$VERSION'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2))"

   if $DRY_RUN; then
     npm pack --dry-run
   elif $LOCAL; then
     npm pack
     echo "Package: $(ls *.tgz)"
   else
     npm publish --tag "$TAG" --access public
   fi
   ```

6. **Add scripts to root `package.json`**:
   ```json
   "publish:npm": "./scripts/publish-npm.sh",
   "publish:npm:local": "./scripts/publish-npm.sh --local",
   "publish:npm:dry": "./scripts/publish-npm.sh --dry-run"
   ```

7. **Add `.npmrc`** (gitignored):
   ```
   //registry.npmjs.org/:_authToken=${NPM_TOKEN}
   ```

8. **Update `.gitignore`**:
   ```
   .npmrc
   .pack/
   ```

## Todo

- [ ] Create `bin/n9tray.js` CLI entry point
- [ ] Create `lib/installer.js` with GitHub Release download logic
- [ ] Create `scripts/publish/package.json` manifest
- [ ] Create `scripts/publish-npm.sh` with --local, --dry-run, --tag flags
- [ ] Add publish scripts to root package.json
- [ ] Add `.npmrc` template and gitignore it
- [ ] Test `--local` pack produces valid tarball
- [ ] Test `npx ./pack/n9tray-*.tgz` installs and launches app
- [ ] Test `--update` re-downloads latest release
- [ ] Publish to npm with `--dry-run` first
- [ ] Publish v0.1.0 to npm

## Success Criteria

- `npx n9tray` on a fresh machine downloads DMG, extracts .app, launches tray
- `npx n9tray` on subsequent runs launches immediately (no re-download)
- `npx n9tray --update` fetches latest release
- `npx n9tray --version` prints current version
- `npm i -g n9tray && n9tray` works as global install
- Package size < 20KB (binary not bundled)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GitHub API rate limit for unauthenticated requests | Medium | Medium | Cache installed version, only fetch on --update |
| DMG mount fails in restricted environments | Low | Medium | Provide manual download fallback instructions |
| npm package name `n9tray` taken | Low | High | Check availability before publishing; fallback: `@n9router/tray` |
| macOS Gatekeeper blocks extracted .app | Medium | Medium | Document `xattr -cr` workaround; future: sign the app |

## Security Considerations

- Downloads only from GitHub Releases (HTTPS, verified repo)
- No npm token in the published package
- `.npmrc` with auth token is gitignored
- CLI does not run with elevated privileges
- Consider adding checksum verification for downloaded DMG
- Future: verify GitHub Release asset signatures

## Next Steps

After all 6 phases are complete, the full lifecycle is:
1. User logs in → tray starts (Phase 1)
2. Tray starts → n9router starts (Phase 2)
3. Port conflict → auto-resolved (Phase 3)
4. Developer builds DMG locally (Phase 4)
5. Tag push → CI builds + releases (Phase 5)
6. Users install via `npx n9tray` (Phase 6)
