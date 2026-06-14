// Profile avatars. A profile's `image` is either "preset:<id>", a local file
// path / URL, or null (falls back to the default character preset).

import emberDirector from "../assets/profile-avatars/ember-director.jpg";
import grapeInventor from "../assets/profile-avatars/grape-inventor.jpg";
import lagoonPilot from "../assets/profile-avatars/lagoon-pilot.jpg";
import marqueeHost from "../assets/profile-avatars/marquee-host.jpg";
import mintScout from "../assets/profile-avatars/mint-scout.jpg";
import mossExplorer from "../assets/profile-avatars/moss-explorer.jpg";
import nebulaNavigator from "../assets/profile-avatars/nebula-navigator.jpg";
import roseArchivist from "../assets/profile-avatars/rose-archivist.jpg";
import slateAnalyst from "../assets/profile-avatars/slate-analyst.jpg";
import duskGuardian from "../assets/profile-avatars/dusk-guardian.jpg";
import { cx, imageSrc } from "./utils";

interface PresetSpec {
  id: string;
  label: string;
  src: string;
}

export const AVATAR_PRESETS: PresetSpec[] = [
  { id: "nebula", label: "Nebula Navigator", src: nebulaNavigator },
  { id: "ember", label: "Ember Director", src: emberDirector },
  { id: "lagoon", label: "Lagoon Pilot", src: lagoonPilot },
  { id: "moss", label: "Moss Explorer", src: mossExplorer },
  { id: "marquee", label: "Marquee Host", src: marqueeHost },
  { id: "grape", label: "Grape Inventor", src: grapeInventor },
  { id: "rose", label: "Rose Archivist", src: roseArchivist },
  { id: "mint", label: "Mint Scout", src: mintScout },
  { id: "dusk", label: "Dusk Guardian", src: duskGuardian },
  { id: "slate", label: "Slate Analyst", src: slateAnalyst },
];

export const DEFAULT_AVATAR_IMAGE = `preset:${AVATAR_PRESETS[0].id}`;

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
  const preset = presetFor(image) ?? (!image ? AVATAR_PRESETS[0] : undefined);
  if (preset) {
    return (
      <span className={cx("block overflow-hidden bg-bg-elevated", className)}>
        <img src={preset.src} alt="" draggable={false} className="h-full w-full object-cover" />
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
