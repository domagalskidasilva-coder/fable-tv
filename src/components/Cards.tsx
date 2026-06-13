import { useState } from "react";
import type { MediaCard } from "../lib/types";
import { cx, imageSrc, progressOf } from "../lib/utils";
import { toggleFavorite } from "../lib/api";
import { useHoverLift } from "../lib/gsap";
import { HeartIcon, PlayIcon } from "./ui";

function CardImage({
  src,
  alt,
  className,
  contain,
}: {
  src: string | null;
  alt: string;
  className?: string;
  contain?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const url = imageSrc(src);
  if (!url || failed) {
    return (
      <div
        className={cx(
          "flex items-center justify-center bg-gradient-to-br from-surface-2 to-surface text-2xl font-black text-ink-faint",
          className,
        )}
      >
        {alt.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={cx(contain ? "object-contain p-3" : "object-cover", className)}
    />
  );
}

function FavoriteButton({ card }: { card: MediaCard }) {
  const [fav, setFav] = useState(card.favorite);
  return (
    <button
      tabIndex={-1}
      aria-label="favorito"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          setFav(await toggleFavorite(card.itemType, card.id));
        } catch {
          /* keep previous state */
        }
      }}
      className={cx(
        "absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/55 backdrop-blur-sm transition-all duration-200",
        "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        fav ? "text-danger opacity-100" : "text-white hover:scale-110",
      )}
    >
      <HeartIcon filled={fav} />
    </button>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
      <div className="h-full bg-brand" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

/** Portrait card for movies and series. */
export function PosterCard({ card, onOpen }: { card: MediaCard; onOpen: (c: MediaCard) => void }) {
  const hover = useHoverLift<HTMLButtonElement>({ scale: 1.07, lift: -8 });
  const progress = progressOf(card.positionSecs, card.durationSecs);
  return (
    <button
      data-nav
      ref={hover.ref}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
      onFocus={hover.onFocus}
      onBlur={hover.onBlur}
      onClick={() => onOpen(card)}
      className="group relative w-full origin-center text-left"
      title={card.name}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-lg ring-0 transition-[box-shadow,border-color] duration-300 group-hover:border-white/25 group-hover:shadow-[0_24px_50px_-20px_rgba(0,0,0,0.8)]">
        <FavoriteButton card={card} />
        <CardImage src={card.image} alt={card.name} className="h-full w-full" />
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/85 via-black/0 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <div className="flex w-full items-center gap-2 p-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-black shadow-lg">
              <PlayIcon size={16} />
            </span>
            <span className="line-clamp-2 text-xs font-semibold text-white text-shadow-sm">
              {card.name}
            </span>
          </div>
        </div>
        {progress !== null && <ProgressBar value={progress} />}
      </div>
      <p className="mt-2.5 truncate text-sm font-medium text-ink">{card.name}</p>
      {card.subtitle && <p className="truncate text-xs text-ink-dim">{card.subtitle}</p>}
    </button>
  );
}

/** Landscape tile for live channels (and episodes). */
export function ChannelCard({
  card,
  onOpen,
  epgLine,
}: {
  card: MediaCard;
  onOpen: (c: MediaCard) => void;
  epgLine?: string | null;
}) {
  const hover = useHoverLift<HTMLButtonElement>({ scale: 1.05, lift: -6 });
  return (
    <button
      data-nav
      ref={hover.ref}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
      onFocus={hover.onFocus}
      onBlur={hover.onBlur}
      onClick={() => onOpen(card)}
      className="group relative w-full origin-center text-left"
      title={card.name}
    >
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-line/60 bg-surface-2 shadow-md transition-[box-shadow,border-color] duration-300 group-hover:border-white/25 group-hover:shadow-[0_24px_50px_-20px_rgba(0,0,0,0.8)]">
        <FavoriteButton card={card} />
        <CardImage src={card.image} alt={card.name} contain className="h-full w-full" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand text-white shadow-xl">
            <PlayIcon />
          </span>
        </div>
      </div>
      <p className="mt-2.5 truncate text-sm font-semibold text-ink">{card.name}</p>
      <p className="truncate text-xs text-ink-dim">{epgLine ?? card.subtitle ?? " "}</p>
    </button>
  );
}

/** Wide 16:9 card with progress for "continue watching". */
export function ContinueCard({ card, onOpen }: { card: MediaCard; onOpen: (c: MediaCard) => void }) {
  const hover = useHoverLift<HTMLButtonElement>({ scale: 1.04, lift: -6 });
  const progress = progressOf(card.positionSecs, card.durationSecs) ?? 0;
  return (
    <button
      data-nav
      ref={hover.ref}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
      onFocus={hover.onFocus}
      onBlur={hover.onBlur}
      onClick={() => onOpen(card)}
      className="group relative w-72 shrink-0 origin-center text-left"
      title={card.name}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-lg transition-[box-shadow,border-color] duration-300 group-hover:border-white/25 group-hover:shadow-[0_24px_50px_-20px_rgba(0,0,0,0.8)]">
        <FavoriteButton card={card} />
        <CardImage src={card.image} alt={card.name} className="h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <p className="truncate text-sm font-bold text-white text-shadow">{card.name}</p>
          {card.subtitle && (
            <p className="truncate text-xs text-white/70 text-shadow-sm">{card.subtitle}</p>
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-black shadow-xl">
            <PlayIcon />
          </span>
        </div>
        <ProgressBar value={progress} />
      </div>
    </button>
  );
}
