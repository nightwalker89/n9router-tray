# Phase 3: Kill Port 20128 Before Starting n9router

## Context Links

- n9router start command: `src-tauri/src/lib.rs` line 388 (`n9router_start`)
- Port detection: `find_n9router_pids()` in lib.rs line 175
- Kill utility: `kill_pid()` in lib.rs line 163
- Settings store: `tray-settings.json`

## Overview

Add a "Kill port before start" option that forcefully terminates any process occupying port 20128 before spawning n9router. Useful when a zombie n9router or another process blocks the port.

## Key Insights

- `find_n9router_pids()` already uses `lsof -ti :20128` to find PIDs on the port
- `kill_pid()` sends SIGTERM to a given PID
- Current `n9router_start` returns early with `already_running` if port is occupied — the new option bypasses this
- The setting should be persisted in `tray-settings.json` alongside `autoStartN9router`
- Both manual start (StatusBar button) and auto-start (useAutoStart hook) should respect this setting

## Requirements

1. Add `killPortBeforeStart` boolean to tray store
2. Add toggle in SettingsPanel Section A
3. Modify `n9router_start` Rust command to accept optional `force: bool` parameter
4. When `force=true`: kill all PIDs on port 20128, wait 500ms, then spawn
5. Frontend reads setting and passes `force` when invoking start
6. `useAutoStart` hook also reads and passes this setting

## Architecture

```
Frontend (SettingsPanel / StatusBar / useAutoStart)
  └─ reads killPortBeforeStart from store
  └─ invoke("n9router_start", { force: true/false })

lib.rs n9router_start(force: Option<bool>)
  └─ if force == Some(true):
       └─ find_n9router_pids() → kill each
       └─ sleep 500ms
  └─ proceed with normal spawn logic
```

## Related Code Files

- `src-tauri/src/lib.rs` — modify `n9router_start` command
- `src/panels/SettingsPanel.jsx` — add toggle
- `src/hooks/useAutoStart.js` — pass force param
- `src/App.jsx` — StatusBar `handleStart` callback

## Implementation Steps

1. **Modify Rust command** in `lib.rs`:
   ```rust
   #[tauri::command]
   fn n9router_start(force: Option<bool>) -> Result<serde_json::Value, String> {
       let force = force.unwrap_or(false);

       if force {
           // Kill anything on the port
           let pids = find_n9router_pids();
           for pid in &pids {
               kill_pid(*pid);
           }
           if !pids.is_empty() {
               std::thread::sleep(std::time::Duration::from_millis(500));
           }
       } else if let Some(pid) = find_n9router_pid() {
           return Ok(serde_json::json!({ "ok": true, "method": "already_running", "pid": pid }));
       }

       // ... rest of spawn logic unchanged
   }
   ```

2. **Add store setting** in `SettingsPanel.jsx`:
   ```jsx
   const [killPort, setKillPort] = useState(false);

   // In store load effect:
   const kp = await s.get("killPortBeforeStart");
   setKillPort(!!kp);

   // Toggle handler:
   const setKillPortVal = async val => {
     setKillPort(val);
     if (store) {
       await store.set("killPortBeforeStart", val);
       await store.save();
     }
   };
   ```

3. **Add toggle row** in Section A (after "Auto-start n9router"):
   ```jsx
   <SettingRow
     label="Kill port before start"
     description="Terminate any process on port 20128 before starting n9router"
     topBorder
   >
     <SettingToggle checked={killPort} onChange={setKillPortVal} disabled={!storeReady} />
   </SettingRow>
   ```

4. **Update StatusBar handleStart** in `App.jsx`:
   ```jsx
   const handleStart = useCallback(async () => {
     // Read kill-port setting
     const store = await load("tray-settings.json", { autoSave: false });
     const force = await store.get("killPortBeforeStart");
     await invoke("n9router_start", { force: !!force });
   }, []);
   ```

5. **Update useAutoStart hook**:
   ```js
   const killPort = await store.get("killPortBeforeStart");
   await invoke("n9router_start", { force: !!killPort });
   ```

## Todo

- [ ] Modify `n9router_start` to accept `force: Option<bool>` parameter
- [ ] Implement kill-all-on-port logic when force=true
- [ ] Add `killPortBeforeStart` state to SettingsPanel
- [ ] Add toggle UI in Section A
- [ ] Update StatusBar handleStart to pass force param
- [ ] Update useAutoStart hook to pass force param
- [ ] Test: enable setting, start with zombie on port → zombie killed, n9router starts
- [ ] Test: disable setting, start with zombie on port → returns "already_running"
- [ ] Test: enable setting, nothing on port → starts normally

## Success Criteria

- With setting ON + port occupied: old process killed, n9router starts fresh
- With setting OFF + port occupied: returns "already_running" (existing behavior)
- Kill uses SIGTERM (graceful), not SIGKILL
- 500ms delay between kill and spawn prevents port reuse race

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Killing unrelated process on port | Low | Medium | Port 20128 is n9router-specific, unlikely collision |
| SIGTERM not enough, process lingers | Low | Low | Could escalate to SIGKILL after timeout in future |
| Race: port not released in 500ms | Low | Low | n9router will fail to bind, user can retry |

## Security Considerations

- Only kills processes the current user owns (kill without sudo)
- No privilege escalation
- Port 20128 is a non-privileged port (>1024)

## Next Steps

This completes the process management features. Phase 4 moves to build/distribution.
