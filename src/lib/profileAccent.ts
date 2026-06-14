interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface ProfileAccentTokens {
  accent: string;
  accent2: string;
  accentStrong: string;
  accentRgb: string;
  accentSoft: string;
  accentGlow: string;
  accentGlowStrong: string;
  accentGlowSubtle: string;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHexColor(value: string | null | undefined): Rgb | null {
  if (!value) return null;
  const raw = value.trim().replace(/^#/, "");
  const hex = raw.length === 3
    ? raw.split("").map((c) => c + c).join("")
    : raw;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => clampChannel(v).toString(16).padStart(2, "0")).join("")}`;
}

function mix(from: Rgb, to: Rgb, weight: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * weight,
    g: from.g + (to.g - from.g) * weight,
    b: from.b + (to.b - from.b) * weight,
  };
}

function rgba(rgb: Rgb, alpha: number): string {
  return `rgba(${clampChannel(rgb.r)}, ${clampChannel(rgb.g)}, ${clampChannel(rgb.b)}, ${alpha})`;
}

export function profileAccentTokens(color: string | null | undefined, theme: string): ProfileAccentTokens | null {
  const base = parseHexColor(color);
  if (!base) return null;

  const isLight = theme === "light";
  const accent2 = mix(base, { r: 0, g: 0, b: 0 }, isLight ? 0.18 : 0.28);
  const accentStrong = mix(base, { r: 255, g: 255, b: 255 }, isLight ? 0.1 : 0.24);

  return {
    accent: toHex(base),
    accent2: toHex(accent2),
    accentStrong: toHex(accentStrong),
    accentRgb: `${clampChannel(base.r)}, ${clampChannel(base.g)}, ${clampChannel(base.b)}`,
    accentSoft: rgba(base, isLight ? 0.12 : 0.16),
    accentGlow: rgba(base, 0.4),
    accentGlowStrong: rgba(base, 0.78),
    accentGlowSubtle: rgba(base, 0.15),
  };
}
