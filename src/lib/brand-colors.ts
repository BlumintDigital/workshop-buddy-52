// Brand color overrides: convert hex -> HSL and inject as CSS custom properties.

export type BrandColors = {
  primary?: string | null; // HSL string like "110 14% 54%"
  accent?: string | null;
};

export const DEFAULT_BRAND = {
  primary: "110 14% 54%",
  accent: "82 35% 70%",
} as const;

export const PRESETS: { name: string; hex: string }[] = [
  { name: "Sage", hex: "#7d9b76" },
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

export function applyBrandColors(colors: BrandColors) {
  const root = document.documentElement;
  const primary = colors.primary || null;
  const accent = colors.accent || null;
  const setOrClear = (prop: string, value: string | null) => {
    if (value) root.style.setProperty(prop, value);
    else root.style.removeProperty(prop);
  };
  setOrClear("--primary", primary);
  setOrClear("--sidebar-primary", primary);
  setOrClear("--ring", primary);
  setOrClear("--accent", accent);
  setOrClear("--sidebar-accent", accent ? adjustL(accent, 10) : null);
}
