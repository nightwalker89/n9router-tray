/**
 * HUD color presets — design-system themes for the Activity HUD.
 * Inspired by n9router's Usage Flex report themes (cyber / gold / meme / minimal).
 *
 * Each preset only carries data needed for the Settings picker swatch.
 * The actual styling lives in App.css under [data-hud-preset="<id>"], which
 * overrides accent/background CSS variables — keeping the HUD render logic
 * theme-agnostic.
 */
export const HUD_PRESETS = [
  {
    id: "midnight",
    label: "Midnight",
    hint: "Cool slate blue — the classic",
    swatch: ["#0a84ff", "#28282e", "#16161a"],
    accent: "#0a84ff",
  },
  {
    id: "cyber",
    label: "Cyber",
    hint: "Indigo neon over deep space",
    swatch: ["#6366f1", "#1e1b4b", "#0f172a"],
    accent: "#818cf8",
  },
  {
    id: "matrix",
    label: "Matrix",
    hint: "Terminal emerald glow",
    swatch: ["#34d399", "#022c22", "#04130d"],
    accent: "#34d399",
  },
  {
    id: "gold",
    label: "Gold",
    hint: "Luxe amber on espresso",
    swatch: ["#f59e0b", "#2d1a00", "#160c00"],
    accent: "#fbbf24",
  },
  {
    id: "synthwave",
    label: "Synthwave",
    hint: "Hot magenta sunset",
    swatch: ["#ec4899", "#3b0764", "#1a0b2e"],
    accent: "#f472b6",
  },
  {
    id: "graphite",
    label: "Graphite",
    hint: "Muted monochrome, low-key",
    swatch: ["#94a3b8", "#27272a", "#161618"],
    accent: "#cbd5e1",
  },
];

export const DEFAULT_HUD_PRESET = "midnight";

export function resolveHudPreset(id) {
  return HUD_PRESETS.some((p) => p.id === id) ? id : DEFAULT_HUD_PRESET;
}
