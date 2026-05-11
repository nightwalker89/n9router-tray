/**
 * TerminalPanel — floating window that shows n9router stdout or log.txt tail.
 *
 * Rendered at /#terminal (separate window, not inside the tray dropdown).
 * - If managed by tray: live ring-buffer from piped stdout
 * - If external: tails ~/.n9router/log.txt + offers "Focus Terminal" button
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// ── ANSI-like colour heuristics ──────────────────────────────────────────────
function lineClass(line) {
  const l = line.toLowerCase();
  if (l.includes("error") || l.includes("[stderr]") || l.includes("failed")) return "t-err";
  if (l.includes("warn")) return "t-warn";
  if (l.includes("200 ok") || l.includes("ready") || l.includes("started") || l.includes("✅")) return "t-ok";
  if (l.includes("[mitm]") || l.includes("[route]")) return "t-route";
  return "t-default";
}

export default function TerminalPanel() {
  const [lines, setLines]         = useState([]);
  const [managed, setManaged]     = useState(false);
  const [pid, setPid]             = useState(null);
  const [source, setSource]       = useState("log_file");
  const [pinBottom, setPinBottom] = useState(true);
  const [focusResult, setFocusResult] = useState(null);
  const logRef = useRef(null);
  const localClearRef = useRef(0); // offset: skip first N lines

  const fetchLogs = useCallback(async () => {
    try {
      const data = await invoke("n9router_get_logs", { count: 500 });
      setManaged(data.managed);
      setPid(data.pid ?? null);
      setSource(data.source ?? "log_file");
      setLines(prev => {
        const incoming = data.lines ?? [];
        // If count didn't change and same source, avoid thrashing
        if (prev.length === incoming.length && prev[prev.length - 1] === incoming[incoming.length - 1]) {
          return prev;
        }
        return incoming;
      });
    } catch (e) {
      console.error("n9router_get_logs error:", e);
    }
  }, []);

  // Poll every 1s
  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 1000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  // Auto-scroll
  useEffect(() => {
    if (pinBottom && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, pinBottom]);

  const handleFocusTerminal = async () => {
    try {
      const res = await invoke("n9router_focus_terminal");
      setFocusResult(res);
      setTimeout(() => setFocusResult(null), 4000);
    } catch (e) {
      setFocusResult({ ok: false, reason: String(e) });
      setTimeout(() => setFocusResult(null), 4000);
    }
  };

  const displayLines = lines.slice(localClearRef.current);

  return (
    <div className="terminal-root">
      {/* Header */}
      <div className="terminal-header">
        <div className="terminal-status">
          <span className={`t-dot ${managed ? "t-dot-green" : "t-dot-yellow"}`} />
          <span className="t-status-text">
            {managed
              ? `Managed by tray${pid ? ` · PID ${pid}` : ""}`
              : `External process${pid ? ` · PID ${pid}` : " · not running"}`}
          </span>
          {source === "log_file" && !managed && (
            <span className="t-badge-log">log.txt</span>
          )}
        </div>

        <div className="terminal-controls">
          {!managed && pid && (
            <button
              className="t-btn t-btn-focus"
              onClick={handleFocusTerminal}
              title="Focus the terminal that started n9router"
            >
              ⌨ Focus Terminal
            </button>
          )}
          <button
            className={`t-btn ${pinBottom ? "t-btn-active" : ""}`}
            onClick={() => setPinBottom(v => !v)}
            title="Pin scroll to bottom"
          >
            ↓ {pinBottom ? "Pinned" : "Pin"}
          </button>
          <button
            className="t-btn"
            onClick={() => { localClearRef.current = lines.length; setLines([]); }}
            title="Clear view"
          >
            Clear
          </button>
          <span className="t-line-count">{lines.length.toLocaleString()} lines</span>
        </div>
      </div>

      {/* Focus result toast */}
      {focusResult && (
        <div className={`t-toast ${focusResult.ok ? "t-toast-ok" : "t-toast-err"}`}>
          {focusResult.ok
            ? `✓ Focused ${focusResult.app}`
            : `${focusResult.reason}${focusResult.fallback === "log_file" ? " — showing log.txt" : ""}`}
        </div>
      )}

      {/* Log area */}
      <div className="terminal-body" ref={logRef} onScroll={e => {
        const el = e.currentTarget;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
        if (!atBottom && pinBottom) setPinBottom(false);
      }}>
        {displayLines.length === 0 ? (
          <div className="t-empty">
            {pid
              ? "Waiting for output…"
              : "n9router is not running. Start it from the tray or via CLI."}
          </div>
        ) : (
          displayLines.map((line, i) => (
            <div key={i} className={`terminal-line ${lineClass(line)}`}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
