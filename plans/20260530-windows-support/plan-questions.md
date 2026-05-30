# Open Questions — Windows Support

List of unresolved items to confirm before/while executing. Defaults are coded best-effort but may need correction.

## Q1 — Antigravity install paths + v1/v2/IDE distinction (HIGH)
macOS detects variants via `.app` internals (`app/bin/antigravity` = v1; `app.asar` only = v2; AGY IDE = separate `.app`).
Need from user:
- (a) Actual Windows install path(s) of Antigravity on your machine.
- (b) How AGYv1 / AGYv2 / AGY-IDE differ on Windows — separate install folders, or same folder different internals?
Coded defaults (probe order):
- v1/v2: `%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe`, then `%ProgramFiles%\Antigravity\Antigravity.exe`
- IDE: `%LOCALAPPDATA%\Programs\Antigravity IDE\Antigravity IDE.exe`, then ProgramFiles
- v1 vs v2: presence of `resources\app\bin\antigravity*` (v1) vs only `resources\app.asar` (v2)

## Q2 — Installer format + scope (MED)
Default: emit BOTH NSIS `.exe` (currentUser/perUser, no admin) + MSI; CLI prefers `.exe`.
Confirm: NSIS-only? perMachine instead of perUser? (affects install path the CLI probes.)

## Q3 — Single-instance plugin (RESOLVED)
IMPLEMENTED (2026-05-30): added `tauri-plugin-single-instance` **Windows-only** (cfg-gated dep + builder registration). Re-launching focuses the existing tray window. macOS build is unaffected (crate compiled out). Reversible by removing the dep + the `#[cfg(target_os="windows")]` builder block.

## Q4 — Code signing (MED)
No cert assumed → unsigned `.exe`/MSI triggers SmartScreen "unknown publisher" (parallels current unsigned macOS). 
Confirm: do you have an OV/EV signing cert to wire into CI, or accept unsigned?

## Q5 — n9router backend on Windows (MED, out of tray scope)
The MITM proxy, cert install, hosts/DNS edits, and sudo prompts are handled by the n9router SERVER, not this tray. Those panels will render on Windows but their actions only work if n9router itself supports Windows.
Confirm: is n9router Windows-capable, or should the tray hide/disable MITM+DNS controls on Windows?

## Q6 — Architecture: relocate vs separate-file seam (RESOLVED)
DECIDED (user 2026-05-30): Do NOT relocate macOS code. macOS seam fns STAY in `lib.rs` (bodies unchanged, gain `#[cfg(target_os="macos")]`). ALL Windows code goes in a NEW `platform_windows.rs`. Existing files modified as little as possible; Windows work must not impact macOS. Phase 1 rewritten accordingly.

---
Implemented with coded defaults. Genuinely open pre-release decisions: **Q4** (code signing — currently unsigned) and **Q5** (whether n9router's backend supports Windows; otherwise consider hiding MITM/DNS controls). Q1 paths should be confirmed against a real Windows Antigravity install.
