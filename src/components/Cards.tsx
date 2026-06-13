import { motion } from "framer-motion";
import { useState } from "react";
import type { MediaCard } from "../lib/types";
import { cx, imageSrc, progressOf } from "../lib/utils";
import { toggleFavorite } from "../lib/api";
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
          "flex items-center justify-center bg-gradient-to-br from-surface to-surface-hover text-2xl font-bold text-ink-dim/50",
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
      onError={() => setFailed(true)}
      className={cx(contain ? "object-contain p-3" : "object-cover", className)}
    />
  );
}

function FavoriteButton({ card }: { card: MediaCard }) {
  const [fav, setFav] = useState(card.favorite);
  return (
    <button
      aria-label="favorito"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          setFav(await toggleFavorite(card.itemType, card.id));
        } catch {
          // keep previous state on failure
        }
      }}
      className={cx(
        "absolute right-2 top-2 z-10 rounded-full bg-black/55 p-2 backdrop-blur-sm transition-all",
        "opacity-0 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100",
        fav ? "text-danger opacity-100" : "text-white",
      )}
    >
      <HeartIcon filled={fav} />
    </button>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
      <div className="h-full bg-accent" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

/** Portrait card for movies and series. */
export function PosterCard({ card, onOpen }: { card: MediaCard; onOpen: (c: MediaCard) => void }) {
  const progress = progressOf(card.positionSecs, card.durationSecs);
  return (
    <motion.button
      data-nav
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onClick={() => onOpen(card)}
      className="group relative w-full text-left"
      title={card.name}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-line/50 bg-surface shadow-lg">
        <FavoriteButton card={card} />
        <CardImage src={card.image} alt={card.name} className="h-full w-full" />
        {progress !== null && <ProgressBar value={progress} />}
      </div>
      <p className="mt-2 truncate text-sm font-medium text-ink">{card.name}</p>
      {card.subtitle && <p className="truncate text-xs text-ink-dim">{card.subtitle}</p>}
    </motion.button>
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
  return (
    <motion.button
      data-nav
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onClick={() => onOpen(card)}
      className="group relative w-full text-left"
      title={card.name}
    >
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-line/50 bg-surface shadow-md">
        <FavoriteButton card={card} />
        <CardImage src={card.image} alt={card.name} contain className="h-full w-full" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="rounded-full bg-accent p-3 text-white shadow-xl">
            <PlayIcon />
          </span>
        </div>
      </div>
      <p className="mt-2 truncate text-sm font-medium text-ink">{card.name}</p>
      <p className="truncate text-xs text-ink-dim">{epgLine ?? card.subtitle ?? " "}</p>
    </motion.button>
  );
}

/** Wide 16:9 card with progress for "continue watching". */
export function ContinueCard({ card, onOpen }: { card: MediaCard; onOpen: (c: MediaCard) => void }) {
  const progress = progressOf(card.positionSecs, card.durationSecs) ?? 0;
  return (
    <motion.button
      data-nav
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onClick={() => onOpen(card)}
      className="group relative w-64 shrink-0 text-left"
      title={card.name}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line/50 bg-surface shadow-lg">
        <FavoriteButton card={card} />
        <CardImage src={card.image} alt={card.name} className="h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent" />
        <div className="absolute bottom-2 left-3 right-3">
          <p className="truncate text-sm font-semibold text-white text-shadow">{card.name}</p>
          {card.subtitle && (
            <p className="truncate text-xs text-white/70 text-shadow">{card.subtitle}</p>
          )}
        </div>
        <ProgressBar value={progress} />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="rounded-full bg-accent p-3 text-white shadow-xl">
            <PlayIcon />
          </span>
        </div>
      </div>
    </motion.button>
  );
}
