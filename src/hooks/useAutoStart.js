/**
 * useAutoStart — runs once on tray launch.
 * If the user has "Auto-start n9router" enabled in tray settings
 * and n9router is not currently running, starts it via the Rust command.
 */
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";

export function useAutoStart() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const store = await load("tray-settings.json", { autoSave: false });
        const autoStart = await store.get("autoStartN9router");
        if (!autoStart || cancelled) return;

        const status = await invoke("n9router_status");
        if (!status.running && !cancelled) {
          await invoke("n9router_start");
        }
      } catch (e) {
        // silently ignore — store may not exist yet, or n9router not installed
        console.warn("[useAutoStart]", e);
      }
    })();

    return () => { cancelled = true; };
  }, []); // run once on mount
}
