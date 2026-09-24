// Brand color overrides: convert hex -> HSL and inject as CSS custom properties.

export type BrandColors = {
  primary?: string | null; // HSL string like "110 14% 54%"
  accent?: string | null;
};

export const DEFAULT_BRAND = {
  primary: "150 39% 30%",
  accent: "82 35% 70%",
} as const;

export const PRESETS: { name: string; hex: string }[] = [
  { name: "Sage", hex: "#2e6a4c" },
  { name: "Indigo", hex: "#4f46e5" },
  { name: "Rose", hex: "#e11d48" },
  { name: "Amber", hex: "#d97706" },
  { name: "Teal", hex: "#0d9488" },
  { name: "Slate", hex: "#475569" },
];

export function hexToHslString(hex: string): string | null {
  const m = hex.trim().replace("#", "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function hslStringToHex(hsl: string): string | null {
  const parts = hsl.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!parts) return null;
  const h = parseFloat(parts[1]) / 360;
  const s = parseFloat(parts[2]) / 100;
  const l = parseFloat(parts[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function adjustL(hsl: string, delta: number): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length !== 3) return hsl;
  const l = Math.min(95, Math.max(5, parseFloat(parts[2]) + delta));
  return `${parts[0]} ${parts[1]} ${l}%`;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio of an HSL colour against white text (WCAG 2.1). */
export function contrastWithWhite(hsl: string): number | null {
  const hex = hslStringToHex(hsl);
  if (!hex) return null;
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

/**
 * Darkens a brand primary until white text on it reaches WCAG AA (4.5:1),
 * so any colour an admin picks still yields readable buttons and links.
 */
export function ensureReadablePrimary(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length !== 3) return hsl;
  let l = parseFloat(parts[2]);
  let candidate = hsl;
  while (l > 5) {
    const ratio = contrastWithWhite(candidate);
    if (ratio === null || ratio >= 4.5) return candidate;
    l -= 2;
    candidate = `${parts[0]} ${parts[1]} ${l}%`;
  }
  return candidate;
}

/** Pale tint of the primary hue for selected / highlighted surfaces. */
function softTint(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length !== 3) return hsl;
  const s = Math.min(parseFloat(parts[1]), 40);
  return `${parts[0]} ${s}% 92%`;
}

export function applyBrandColors(colors: BrandColors) {
  const root = document.documentElement;
  const primary = colors.primary ? ensureReadablePrimary(colors.primary) : null;
  const accent = colors.accent || null;
  const setOrClear = (prop: string, value: string | null) => {
    if (value) root.style.setProperty(prop, value);
    else root.style.removeProperty(prop);
  };
  setOrClear("--primary", primary);
  setOrClear("--primary-soft", primary ? softTint(primary) : null);
  setOrClear("--sidebar-primary", primary);
  setOrClear("--ring", primary);
  setOrClear("--accent", accent);
  setOrClear("--sidebar-accent", accent ? adjustL(accent, 10) : null);
}
