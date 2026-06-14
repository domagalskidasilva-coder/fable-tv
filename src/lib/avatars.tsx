// Abstract/geometric profile avatars, generated as inline SVG (offline-safe).
// A profile's `image` is either "preset:<id>", a local file path / URL, or null
// (falls back to a colored initial).

import type { ReactNode } from "react";
import { cx, imageSrc } from "./utils";

interface PresetSpec {
  id: string;
  from: string;
  to: string;
}

export const AVATAR_PRESETS: PresetSpec[] = [
  { id: "nebula", from: "#8b5cf6", to: "#ec4899" },
  { id: "ember", from: "#fb923c", to: "#ef4444" },
  { id: "lagoon", from: "#22d3ee", to: "#3b82f6" },
  { id: "moss", from: "#4ade80", to: "#15803d" },
  { id: "marquee", from: "#f5c451", to: "#d8941c" },
  { id: "grape", from: "#c084fc", to: "#6366f1" },
  { id: "rose", from: "#fb7185", to: "#e11d48" },
  { id: "mint", from: "#2dd4bf", to: "#0d9488" },
  { id: "dusk", from: "#818cf8", to: "#1e1b4b" },
  { id: "slate", from: "#94a3b8", to: "#334155" },
];

/** A geometric motif (white, translucent) varied per preset index. */
function motif(index: number): ReactNode {
  const w = "rgba(255,255,255,0.85)";
  const f = "rgba(255,255,255,0.35)";
  switch (index % 5) {
    case 0:
      return (
        <>
          <circle cx="38" cy="42" r="20" fill={f} />
          <circle cx="62" cy="60" r="14" fill={w} />
        </>
      );
    case 1:
      return <path d="M50 26 L74 70 L26 70 Z" fill={w} opacity="0.9" />;
    case 2:
      return (
        <>
          <path d="M18 44 Q34 30 50 44 T82 44" stroke={w} strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M18 62 Q34 48 50 62 T82 62" stroke={f} strokeWidth="6" fill="none" strokeLinecap="round" />
        </>
      );
    case 3:
      return (
        <>
          <circle cx="50" cy="50" r="24" stroke={w} strokeWidth="6" fill="none" />
          <circle cx="50" cy="50" r="10" fill={w} />
        </>
      );
    default:
      return (
        <>
          <rect x="26" y="26" width="22" height="22" rx="4" fill={w} />
          <rect x="52" y="52" width="22" height="22" rx="4" fill={f} />
        </>
      );
  }
}

function PresetSvg({ spec }: { spec: PresetSpec }) {
  const gid = `fa-${spec.id}`;
  const index = AVATAR_PRESETS.findIndex((p) => p.id === spec.id);
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={spec.from} />
          <stop offset="1" stopColor={spec.to} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gid})`} />
      {motif(index < 0 ? 0 : index)}
    </svg>
  );
}

function presetFor(image: string | null | undefined): PresetSpec | undefined {
  if (!image?.startsWith("preset:")) return undefined;
  const id = image.slice("preset:".length);
  return AVATAR_PRESETS.find((p) => p.id === id);
}

/**
 * Renders a profile avatar. `className` controls size + rounding (+ overflow);
 * `textClassName` sizes the fallback initial.
 */
export function Avatar({
  image,
  color,
  name,
  className,
  textClassName = "text-base",
}: {
  image: string | null | undefined;
  color: string;
  name: string;
  className?: string;
  textClassName?: string;
}) {
  const preset = presetFor(image);
  if (preset) {
    return (
      <span className={cx("block overflow-hidden", className)}>
        <PresetSvg spec={preset} />
      </span>
    );
  }
  const url = image && !image.startsWith("preset:") ? imageSrc(image) : null;
  if (url) {
    return (
      <span className={cx("block overflow-hidden bg-surface", className)}>
        <img src={url} alt="" draggable={false} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className={cx("grid place-items-center font-black text-bg", className)}
      style={{ background: color }}
    >
      <span className={textClassName}>{(name.trim()[0] ?? "?").toUpperCase()}</span>
    </span>
  );
}
