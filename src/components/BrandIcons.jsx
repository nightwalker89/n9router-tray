import antigravityPng from "../assets/providers/antigravity.png";
import cursorPng     from "../assets/providers/cursor.png";
import codexPng      from "../assets/providers/codex.png";
import kiroPng       from "../assets/providers/kiro.png";
import copilotPng    from "../assets/providers/copilot.png";

const ICON_MAP = {
  antigravity: antigravityPng,
  cursor:      cursorPng,
  codex:       codexPng,
  kiro:        kiroPng,
  copilot:     copilotPng,
};

/** Renders a provider PNG icon with a rounded wrapper */
export function ToolIcon({ tool, size = 22 }) {
  const src = ICON_MAP[tool];
  if (!src) return <span style={{ fontSize: size * 0.7, lineHeight: 1 }}>🔧</span>;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={tool}
      style={{
        borderRadius: 5,
        objectFit: "contain",
        flexShrink: 0,
        display: "block",
      }}
    />
  );
}

/** Antigravity icon used standalone (e.g. in the app control card) */
export function AntigravityIcon({ size = 28 }) {
  return (
    <img
      src={antigravityPng}
      width={size}
      height={size}
      alt="Antigravity"
      style={{
        borderRadius: Math.round(size * 0.22),
        objectFit: "contain",
        flexShrink: 0,
        display: "block",
      }}
    />
  );
}
