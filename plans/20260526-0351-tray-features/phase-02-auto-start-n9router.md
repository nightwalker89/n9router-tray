# Phase 2: Auto-start n9router on Tray Launch

## Context Links

- Hook: `src/hooks/useAutoStart.js`
- App entry: `src/App.jsx` (imports and calls `useAutoStart()`)
- Store key: `autoStartN9router` in `tray-settings.json`

## Overview

Verify and harden the existing auto-start n9router feature. The implementation already exists — `useAutoStart` hook reads the store setting and invokes `n9router_start` if enabled and not already running.

## Key Insights

- **Already implemented**: `useAutoStart.js` hook exists and is imported in `App.jsx`
- The hook runs once on mount, checks `autoStartN9router` store value, then invokes `n9router_start`
- Gracefully handles missing store or uninstalled n9router
- The SettingsPanel toggle for this setting already exists in Section A

## Requirements

1. Verify hook is called in the main window only (not terminal window)
2. Add a small startup delay (1-2s) to let the tray UI render first
3. Consider adding a brief status indicator during auto-start
4. Ensure the hook respects the `killPortBeforeStart` setting (Phase 3 dependency)

## Architecture

```
App.jsx (main window only)
  └─ useAutoStart()
       └─ load("tray-settings.json")
       └─ check autoStartN9router === true
       └─ invoke("n9router_status") → if not running
       └─ invoke("n9router_start")
```

## Related Code Files

- `src/hooks/useAutoStart.js` — the hook (already complete)
- `src/App.jsx` — calls the hook (line 10: `import { useAutoStart }`)
- `src/panels/SettingsPanel.jsx` — toggle UI (lines 117, 162-168, 249-254)

## Implementation Steps

1. **Verify terminal window exclusion**: Check that `useAutoStart()` is only called when `!isTerminalWindow`. Looking at App.jsx, the hook is imported at top level — need to confirm it's not called in the terminal branch.

2. **Add startup delay** (optional UX improvement):
   ```js
   // In useAutoStart.js, add a 1.5s delay before starting
   await new Promise(r => setTimeout(r, 1500));
   const status = await invoke("n9router_status");
   ```

3. **Prepare for Phase 3 integration**: When `killPortBeforeStart` is added, the hook should read that setting too and pass it to the start command:
   ```js
   const killPort = await store.get("killPortBeforeStart");
   // Will be used in Phase 3
   ```

4. **Add error surfacing** (optional): Emit a custom event on failure so StatusBar can show it:
   ```js
   } catch (e) {
     console.warn("[useAutoStart]", e);
     // Could emit event for StatusBar to pick up
   }
   ```

## Todo

- [ ] Verify `useAutoStart()` is NOT called in terminal window context
- [ ] Add 1.5s delay before auto-start attempt (UX: let UI render first)
- [ ] Test: enable setting, quit tray, reopen → n9router starts automatically
- [ ] Test: disable setting, quit tray, reopen → n9router does NOT start
- [ ] Test: n9router already running externally → hook skips start (no duplicate)
- [ ] Prepare hook signature for Phase 3 `killPortBeforeStart` integration

## Success Criteria

- With setting ON: opening tray auto-starts n9router within 2-3 seconds
- With setting OFF: opening tray does nothing to n9router
- If n9router already running: no duplicate process spawned
- No errors in console when n9router is not installed

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Race condition with StatusBar polling | Low | Low | StatusBar polls every 5s, will pick up state |
| Hook runs in terminal window | Low | Medium | Verify conditional in App.jsx |
| Store not ready on first launch | Low | Low | Hook already catches errors gracefully |

## Security Considerations

- No new attack surface — reuses existing `n9router_start` command
- Store file is local, user-writable only

## Next Steps

Phase 3 will extend this hook to optionally kill port 20128 before starting.
