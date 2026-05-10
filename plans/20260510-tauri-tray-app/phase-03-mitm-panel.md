# Phase 3: MITM Control Panel

> Parent: [plan.md](./plan.md) | Depends on: Phase 2 | Priority: P0 | Status: TODO

## Overview

Build the MITM control panel — the primary tab in the tray app. Provides:
- Server start/stop toggle
- Cert trust status
- Per-tool DNS toggles (Antigravity, Cursor, Codex, Kiro, Copilot)
- Sudo password prompt when needed

## Key Insights

From n9router's `MitmServerCard.js`:
- MITM start requires `apiKey` + `sudoPassword`
- If `hasCachedPassword` is true → no need to prompt
- DNS toggle per tool via PATCH: `{ tool, action: "enable"|"disable" }`
- Tool DNS requires server to be running first
- Status response: `{ running, pid, certExists, certTrusted, dnsStatus: { antigravity: bool, cursor: bool, ... }, hasCachedPassword }`

## Requirements

### Functional
- [ ] MITM on/off toggle switch
- [ ] Visual status: Running (green), Stopped (gray)
- [ ] Cert status indicator (Exists, Trusted)
- [ ] DNS toggle per tool: Antigravity, Cursor, Codex, Kiro, Copilot
- [ ] DNS toggles disabled when server is stopped
- [ ] Sudo password modal (when hasCachedPassword is false)
- [ ] Error display for failed actions
- [ ] Loading states during start/stop

## UI Wireframe

```
┌─────────────────────────────────────┐
│  🛡 MITM Proxy          [ON ●──]   │
│  PID: 12345 | Cert: ✅ Trusted     │
│                                     │
│  ─── DNS Routing ───                │
│  Antigravity     [ON ●──]          │
│  Cursor          [OFF ──○]         │
│  Codex           [ON ●──]          │
│  Kiro            [OFF ──○]         │
│  Copilot         [OFF ──○]         │
└─────────────────────────────────────┘
```

## Implementation Steps

1. Create `src/panels/MitmPanel.jsx`
2. Use `useMitmStatus()` hook for live data
3. Build toggle switch component (reusable)
4. Wire start/stop to `mitmActions.startMitm()` / `stopMitm()`
5. Wire DNS toggles to `mitmActions.toggleToolDNS()`
6. Build sudo password inline prompt
7. Handle loading + error states
8. Style with macOS-native dark theme

## Component Structure

```jsx
<MitmPanel>
  <ServerToggle />        // ON/OFF + status badges
  <CertStatus />          // Cert + Trusted indicators
  <DNSToolList>           // Per-tool DNS toggles
    <DNSToolToggle tool="antigravity" />
    <DNSToolToggle tool="cursor" />
    <DNSToolToggle tool="codex" />
    <DNSToolToggle tool="kiro" />
    <DNSToolToggle tool="copilot" />
  </DNSToolList>
  <PasswordPrompt />      // Conditional: when !hasCachedPassword
</MitmPanel>
```

## Todo

- [ ] Create `src/panels/MitmPanel.jsx`
- [ ] Create `src/components/ToggleSwitch.jsx` (reusable)
- [ ] Create `src/components/PasswordPrompt.jsx`
- [ ] Wire MITM start/stop actions
- [ ] Wire DNS toggle actions
- [ ] Add loading spinners
- [ ] Add error messages
- [ ] Style with CSS

## Success Criteria

- Toggle MITM on/off from tray
- Per-tool DNS toggles work
- Password prompt appears when needed
- Real-time status updates (5s polling)
- Error states visible and clear

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sudo prompt UX in popup | Medium | Medium | Use cached password if available |
| Toggle lag (5s poll) | Low | Low | Optimistic UI update, then confirm on next poll |
