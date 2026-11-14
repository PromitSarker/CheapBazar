/**
 * Storefront branding is deliberately tiny: a logo (fixed position in every template)
 * and ONE accent colour picked from this list. Every colour has >= 4.5:1 contrast with
 * white, so button labels stay readable whatever a seller chooses.
 */
export const THEME_PRESETS = [
  { id: "ink", label: "Ink", hex: "#18181b", bn: "কালো" },
  { id: "forest", label: "Forest", hex: "#15803d", bn: "সবুজ" },
  { id: "teal", label: "Teal", hex: "#0f766e", bn: "টিল" },
  { id: "ocean", label: "Ocean", hex: "#1d4ed8", bn: "নীল" },
  { id: "indigo", label: "Indigo", hex: "#4338ca", bn: "ইন্ডিগো" },
  { id: "plum", label: "Plum", hex: "#7e22ce", bn: "বেগুনি" },
  { id: "crimson", label: "Crimson", hex: "#b91c1c", bn: "লাল" },
  { id: "umber", label: "Umber", hex: "#92400e", bn: "বাদামি" },
] as const;

export const DEFAULT_THEME = THEME_PRESETS[0].hex;

/** Returns the preset hex for a submitted/stored value, or null if it is not one of ours. */
export function presetHex(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  return THEME_PRESETS.find((p) => p.hex === v)?.hex ?? null;
}

/** Safe value to use in CSS: always a known preset, never raw user input. */
export function themeOrDefault(value: string | null | undefined): string {
  return presetHex(value) ?? DEFAULT_THEME;
}
