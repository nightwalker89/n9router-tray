# Phase 5: Cross-Platform npm CLI + Installer

## Context Links
- Parent: `plan.md` · User decision: "Yes, cross-platform CLI"
- Research: `research/researcher-03-antigravity-cli-ci.md`
- Files: `bin/n9tray.js`, `lib/installer.js`, `scripts/publish/package.json`, `scripts/install.sh`, new `scripts/install.ps1`

## Overview
Date: 2026-05-30 · Priority: medium · Status: pending

Make the single `n9tray` npm package self-detect OS: keep macOS DMG flow, add Windows `.exe` download/run + launch. Add PowerShell one-liner installer.

## Key Insights
- One package, OS-dispatched at runtime (avoids separate npm packages).
- **Separation rule (user):** keep existing macOS JS logic intact in its OWN module; put Windows logic in NEW modules; make the entry files thin dispatchers. So existing `lib/installer.js` DMG code moves verbatim into `lib/installer-macos.js`, and `lib/installer.js` becomes a 3-line `process.platform` switch. Windows lives in NEW `lib/installer-windows.js`.
- NSIS perUser default install → `%LOCALAPPDATA%\Programs\n9router tray\n9router tray.exe`; probe `%ProgramFiles%` fallback for perMachine.
- NSIS silent install: `setup.exe /S` (no admin for currentUser mode).
- Existing redirect-following `fetchJSON`/`download` helpers are pure Node https → share via a small `lib/http.js` (extracted once) so the Windows module reuses them without duplicating.

## Requirements
### Functional
1. NEW `lib/installer-macos.js`: current DMG/`hdiutil` code moved verbatim (behavior unchanged).
2. NEW `lib/installer-windows.js`: download `.exe`, run `/S`, verify install.
3. `lib/installer.js`: thin dispatcher → `require(platform === 'win32' ? './installer-windows' : './installer-macos')`.
4. NEW `lib/http.js`: shared `fetchJSON`/`download` (extracted from current installer.js).
5. `bin/n9tray.js`: minimal edit — OS-aware app-path resolution + launch (macOS `open -a` path preserved).
6. `scripts/publish/package.json`: `"os": ["darwin","win32"]`; ensure `lib/**` all packed.
7. `scripts/install.ps1`: fetch latest release `.exe`, run silent, report.
### Non-functional
8. No behavior change for macOS users (DMG flow byte-identical, just relocated to its module).
9. Graceful errors when asset/exe missing.

## Architecture — bin/n9tray.js
```js
const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
if (!isWin && !isMac) { console.error("n9tray supports macOS and Windows only"); exit(1); }

const APP_PATHS = isMac
  ? ["/Applications/n9router tray.app"]
  : [ path.join(process.env.LOCALAPPDATA, "Programs", "n9router tray", "n9router tray.exe"),
      path.join(process.env.ProgramFiles||"C:/Program Files", "n9router tray", "n9router tray.exe") ];
const installed = APP_PATHS.find(fs.existsSync);

function launch() {
  if (isMac) execSync(`open -a "${APP_PATHS[0]}"`, {stdio:"inherit"});
  else {
    const exe = installed || APP_PATHS[0];
    spawn(exe, [], { detached:true, stdio:"ignore" }).unref();
  }
}
const needsInstall = args.includes("--install")||args.includes("--update")|| !installed;
needsInstall ? require("../lib/installer").install().then(launch)... : launch();
```

## Architecture — module layout (separation-friendly)
```
lib/
├─ http.js              # NEW: fetchJSON + download (extracted, shared)
├─ installer.js         # THIN dispatcher (was: full DMG logic)
├─ installer-macos.js   # NEW: current DMG/hdiutil code moved verbatim
└─ installer-windows.js # NEW: .exe/.msi download + silent install
```
```js
// lib/installer.js  (thin)
const impl = process.platform === "win32"
  ? require("./installer-windows") : require("./installer-macos");
module.exports = { install: impl.install };

// lib/installer-windows.js  (new)
const { fetchJSON, download } = require("./http");
async function install() {
  const release = await fetchJSON(latest);
  const exe = release.assets.find(a => /setup\.exe$/i.test(a.name))
           || release.assets.find(a => a.name.endsWith(".msi"));
  if (!exe) throw new Error("No Windows installer in latest release");
  const dest = path.join(os.tmpdir(), exe.name);
  await download(exe.browser_download_url, dest);
  if (dest.endsWith(".msi")) execSync(`msiexec /i "${dest}" /passive`,{stdio:"inherit"});
  else execSync(`"${dest}" /S`, {stdio:"inherit"});   // NSIS silent
}
module.exports = { install };
```
macOS DMG flow is unchanged — just relocated from `installer.js` into `installer-macos.js`.

## scripts/install.ps1 (new)
```powershell
$ErrorActionPreference = "Stop"
$repo = "nightwalker89/n9router-tray"
$rel = irm "https://api.github.com/repos/$repo/releases/latest"
$asset = $rel.assets | ? { $_.name -match "setup\.exe$" } | select -First 1
if (-not $asset) { throw "No Windows installer found" }
$tmp = Join-Path $env:TEMP $asset.name
irm $asset.browser_download_url -OutFile $tmp
Start-Process -FilePath $tmp -ArgumentList "/S" -Wait
Write-Host "Installed n9router tray. Launch from Start Menu or: n9tray"
```

## Related Code Files
- `lib/installer.js` (becomes thin dispatcher), `lib/installer-macos.js` (new, moved code), `lib/installer-windows.js` (new), `lib/http.js` (new, extracted)
- `bin/n9tray.js` (minimal OS-aware edit)
- `scripts/publish/package.json` (modify), `scripts/install.ps1` (new)
- `README.md` (Windows install section — Phase 6)

## Implementation Steps
1. Extract `fetchJSON`/`download` → `lib/http.js`.
2. Move current DMG `install()` → `lib/installer-macos.js` (verbatim, require http.js).
3. Add `lib/installer-windows.js` (silent .exe/.msi install).
4. Reduce `lib/installer.js` to OS dispatcher.
5. Minimal `bin/n9tray.js` edit: OS-aware app path + launch.
6. Update publish `package.json` os list + ensure new lib files packed.
7. Add `scripts/install.ps1`.
8. Local macOS regression: `--version`, install/launch via `open -a` unchanged.

## Todo
- [ ] lib/http.js extracted
- [ ] lib/installer-macos.js (moved verbatim)
- [ ] lib/installer-windows.js (new)
- [ ] lib/installer.js thin dispatcher
- [ ] bin/n9tray.js minimal OS branch
- [ ] publish package.json os=["darwin","win32"] + packs lib/**
- [ ] install.ps1
- [ ] macOS CLI regression (open -a still works)
- [ ] Windows: npm i -g n9tray → n9tray --install → launches

## Success Criteria
- `n9tray` installs+launches on both OSes from npm.
- macOS behavior identical to today.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Install path mismatch (perUser/perMachine) | Med | Med | Probe both LOCALAPPDATA + ProgramFiles |
| SmartScreen blocks silent install | Med | Med | Document; user accepts prompt; unsigned caveat |
| MSI vs NSIS asset selection | Low | Low | Prefer setup.exe, msi fallback |

## Security Considerations
- Downloads only from GitHub Releases of the pinned repo over HTTPS.
- Executes downloaded installer — same trust model as macOS DMG flow.
- No elevation for currentUser NSIS; MSI `/passive` may prompt UAC.

## Next Steps
Phase 6 builds + publishes the Windows artifacts the CLI consumes.
