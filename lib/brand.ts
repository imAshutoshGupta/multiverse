// Branding: fonts, colours and the CSS variables that theme the whole app.
// Every owner-provided value is validated before it reaches CSS or a URL.

export interface FontOption {
  name: string;
  /** Google Fonts axis spec, "" = regular weight only */
  spec: string;
  feel: string;
}

export const DISPLAY_FONTS: FontOption[] = [
  { name: "Unbounded", spec: "wght@400..900", feel: "Wide and chunky" },
  { name: "Bebas Neue", spec: "", feel: "Tall poster capitals" },
  { name: "Orbitron", spec: "wght@400..900", feel: "Sci-fi" },
  { name: "Russo One", spec: "", feel: "Sporty and heavy" },
  { name: "Audiowide", spec: "", feel: "Retro racing" },
  { name: "Bungee", spec: "", feel: "Arcade signage" },
  { name: "Chakra Petch", spec: "wght@400;500;600;700", feel: "Techy, cut corners" },
  { name: "Oxanium", spec: "wght@400..800", feel: "Squared tech" },
  { name: "Syne", spec: "wght@400..800", feel: "Art-school quirky" },
  { name: "Archivo Black", spec: "", feel: "Bold grotesque" },
  { name: "Rajdhani", spec: "wght@400;500;600;700", feel: "Condensed HUD" },
  { name: "Teko", spec: "wght@400..700", feel: "Narrow scoreboard" },
  { name: "Press Start 2P", spec: "", feel: "8-bit pixels" },
  { name: "Space Grotesk", spec: "wght@400..700", feel: "Clean and modern" },
];

export const BODY_FONTS: FontOption[] = [
  { name: "Onest", spec: "wght@400..800", feel: "Friendly, very legible" },
  { name: "Manrope", spec: "wght@400..800", feel: "Rounded geometric" },
  { name: "Inter", spec: "wght@400..800", feel: "Neutral workhorse" },
  { name: "DM Sans", spec: "wght@400..800", feel: "Soft geometric" },
  { name: "Outfit", spec: "wght@400..800", feel: "Modern geometric" },
  { name: "Plus Jakarta Sans", spec: "wght@400..800", feel: "Crisp and warm" },
  { name: "Rubik", spec: "wght@400..800", feel: "Rounded corners" },
  { name: "Sora", spec: "wght@400..800", feel: "Techy, wide" },
  { name: "Poppins", spec: "wght@400;500;600;700;800", feel: "Popular geometric" },
  { name: "Nunito", spec: "wght@400..800", feel: "Very rounded" },
  { name: "Figtree", spec: "wght@400..800", feel: "Clean, friendly" },
  { name: "Chakra Petch", spec: "wght@400;500;600;700", feel: "Techy" },
];

/** Fonts bundled with the app (no extra download). */
export const DEFAULT_DISPLAY = "Unbounded";
export const DEFAULT_BODY = "Onest";

const FONT_RE = /^[A-Za-z0-9 ]{2,40}$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export const isHex = (v: string) => HEX_RE.test(v);
export const isFontName = (v: string) => FONT_RE.test(v);

/** Google Fonts stylesheet URL for a family, or null for bundled/invalid fonts. */
export function googleFontUrl(name: string, bundled: string): string | null {
  if (!isFontName(name) || name === bundled) return null;
  const opt = [...DISPLAY_FONTS, ...BODY_FONTS].find((f) => f.name === name);
  const family = name.trim().replace(/ /g, "+");
  const spec = opt ? opt.spec : "";
  return `https://fonts.googleapis.com/css2?family=${family}${spec ? `:${spec}` : ""}&display=swap`;
}

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** Readable text colour (near-black or white) on top of `bg`. */
export function onColor(bg: string): string {
  if (!isHex(bg)) return "#ffffff";
  return contrast(bg, "#ffffff") >= contrast(bg, "#0b0b1a") ? "#ffffff" : "#0b0b1a";
}

export interface ThemeInput {
  color_primary: string;
  color_accent: string;
  color_background: string;
  font_display: string;
  font_body: string;
}

/** CSS that overrides the default theme tokens on <html>. */
export function themeCss(t: ThemeInput): string {
  const primary = isHex(t.color_primary) ? t.color_primary : "#7C5CFF";
  const accent = isHex(t.color_accent) ? t.color_accent : "#FFC23D";
  const bg = isHex(t.color_background) ? t.color_background : "#0D0E2B";
  const lightBg = luminance(bg) > 0.4;
  const vars: string[] = [
    `--color-portal:${primary}`,
    `--color-on-portal:${onColor(primary)}`,
    `--color-rift:${accent}`,
    `--color-on-rift:${onColor(accent)}`,
    `--color-void:${bg}`,
    `--color-ink:${lightBg ? "#14132b" : "#f2f0ff"}`,
    `--color-muted:${lightBg ? "#55536f" : "#a3a1c8"}`,
    `--color-tint:${lightBg ? "#000000" : "#ffffff"}`,
  ];
  if (isFontName(t.font_display) && t.font_display !== DEFAULT_DISPLAY) {
    vars.push(`--font-display-face:"${t.font_display}"`);
  }
  if (isFontName(t.font_body) && t.font_body !== DEFAULT_BODY) {
    vars.push(`--font-body:"${t.font_body}"`);
  }
  return `html:root{${vars.join(";")};color-scheme:${lightBg ? "light" : "dark"}}`;
}
