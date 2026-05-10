# Phase 6: Polish — Tray Icon, Animations, Build

> Parent: [plan.md](./plan.md) | Depends on: Phase 3, 4, 5 | Priority: P2 | Status: TODO

## Overview

Final polish: dynamic tray icon with status overlay, smooth transitions, offline state handling, and production build.

## Requirements

### Functional
- [ ] Dynamic tray icon: green dot (MITM on), gray (off), red (error)
- [ ] Badge: show pending request count on tray icon
- [ ] Smooth panel transitions (tab switch, show/hide)
- [ ] Server offline state: full-screen "n9router not running" with retry
- [ ] "Start n9router" button (launches npm run start via shell)
- [ ] System theme detection (dark/light mode)
- [ ] Auto-start on login (optional, macOS launchd)
- [ ] Production build: `cargo tauri build`

### Non-functional
- DMG size < 15MB
- Smooth 60fps transitions
- Accessible: keyboard navigation in popup

## Implementation Steps

1. Create template tray icons (green/gray/red variants)
2. Implement dynamic icon switching based on MITM status
3. Add CSS transitions for panel switches
4. Build server-offline overlay component
5. Add "Start Server" action via `tauri-plugin-shell`
6. Detect macOS theme via `prefers-color-scheme`
7. Configure `tauri.conf.json` for production build
8. Test `cargo tauri build` → verify DMG output
9. (Optional) Add launchd plist for auto-start

## Tray Icon States

```
🟢 n9  — MITM running, no errors
⚪ n9  — MITM stopped
🔴 n9  — MITM error / server offline
 ³     — badge with pending count (overlay)
```

Icons: 22x22px template images (monochrome for macOS menu bar).

## Todo

- [ ] Create tray icon assets (22x22 template PNG)
- [ ] Implement dynamic icon switching in lib.rs
- [ ] Add CSS transitions for tab switches
- [ ] Build server-offline state UI
- [ ] Add "Start Server" shell command
- [ ] Test dark/light mode
- [ ] Run `cargo tauri build` for production DMG
- [ ] Test DMG install + launch

## Success Criteria

- Tray icon reflects MITM status visually
- Panel transitions are smooth
- Server offline state is clear and actionable
- Production DMG builds and installs correctly
- App size < 15MB

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| macOS notarization | High | Medium | Skip for personal use, add later |
| Icon badge API | Medium | Low | Use icon swap instead of overlay |
| Shell spawn n9router | Low | Low | Just open terminal with command |
