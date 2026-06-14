import { useState } from "react";
import type { MediaCard } from "../lib/types";
import { cx, imageSrc, progressOf } from "../lib/utils";
import { toggleFavorite } from "../lib/api";
import { HeartIcon, PlayIcon } from "./ui";
import { motion } from "framer-motion";

export function CardImage({
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
        "absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-full bg-black/40 backdrop-blur-md border border-white/10 transition-all duration-300",
        "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        fav ? "text-accent opacity-100 scale-100 shadow-[0_0_12px_var(--accent-glow)]" : "text-white hover:bg-black/60 hover:scale-110",
      )}
    >
      <HeartIcon filled={fav} />
    </button>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/60 backdrop-blur-sm">
      <div className="h-full bg-accent shadow-[0_0_8px_var(--accent-glow-strong)]" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

/** Portrait card for movies and series. */
export function PosterCard({ card, onOpen }: { card: MediaCard; onOpen: (c: MediaCard) => void }) {
  const progress = progressOf(card.positionSecs, card.durationSecs);
  return (
    <motion.button
      whileHover={{ scale: 1.06, y: -8 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      data-nav
      onClick={() => onOpen(card)}
      className="group relative w-full origin-bottom text-left"
      title={card.name}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-border-soft bg-surface shadow-lg transition-[box-shadow,border-color] duration-300 group-hover:border-accent/50 group-hover:shadow-[0_24px_50px_-16px_rgba(0,0,0,0.9),0_0_24px_var(--accent-glow-subtle)]">
        <FavoriteButton card={card} />
        <CardImage src={card.image} alt={card.name} className="h-full w-full" />
        
        {/* Gloss Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />

        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <div className="flex w-full items-center gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-black shadow-xl">
              <PlayIcon size={18} />
            </span>
            <span className="line-clamp-2 text-sm font-bold text-white text-shadow-sm leading-tight">
              {card.name}
            </span>
          </div>
        </div>
        {progress !== null && <ProgressBar value={progress} />}
      </div>
      <p className="mt-3 truncate text-sm font-bold text-ink">{card.name}</p>
      {card.subtitle && <p className="truncate text-xs font-medium text-ink-dim">{card.subtitle}</p>}
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
      whileHover={{ scale: 1.05, y: -6 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      data-nav
      onClick={() => onOpen(card)}
      className="group relative w-full origin-bottom text-left"
      title={card.name}
    >
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border-soft bg-surface-2 shadow-md transition-[box-shadow,border-color] duration-300 group-hover:border-accent/50 group-hover:shadow-[0_24px_50px_-16px_rgba(0,0,0,0.9),0_0_20px_var(--accent-glow-subtle)]">
        <FavoriteButton card={card} />
        <CardImage src={card.image} alt={card.name} contain className="h-full w-full" />
        
        {/* Gloss Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />

        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px] opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-xl shadow-accent-soft">
            <PlayIcon size={24} />
          </span>
        </div>
      </div>
      <p className="mt-3 truncate text-sm font-bold text-ink">{card.name}</p>
      <p className="truncate text-xs font-medium text-ink-dim">{epgLine ?? card.subtitle ?? " "}</p>
    </motion.button>
  );
}

/** Wide 16:9 card with progress for "continue watching". */
export function ContinueCard({ card, onOpen }: { card: MediaCard; onOpen: (c: MediaCard) => void }) {
  const progress = progressOf(card.positionSecs, card.durationSecs) ?? 0;
  return (
    <motion.button
      whileHover={{ scale: 1.05, y: -6 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      data-nav
      onClick={() => onOpen(card)}
      className="group relative w-72 shrink-0 origin-bottom text-left"
      title={card.name}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border-soft bg-surface shadow-lg transition-[box-shadow,border-color] duration-300 group-hover:border-accent/50 group-hover:shadow-[0_24px_50px_-16px_rgba(0,0,0,0.9),0_0_20px_var(--accent-glow-subtle)]">
        <FavoriteButton card={card} />
        <CardImage src={card.image} alt={card.name} className="h-full w-full" />
        
        {/* Base Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        
        {/* Gloss Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />

        <div className="absolute bottom-4 left-4 right-4 z-10">
          <p className="truncate text-sm font-bold text-white text-shadow">{card.name}</p>
          {card.subtitle && (
            <p className="truncate text-xs font-medium text-white/80 text-shadow-sm mt-0.5">{card.subtitle}</p>
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-black shadow-xl">
            <PlayIcon size={24} />
          </span>
        </div>
        <ProgressBar value={progress} />
      </div>
    </motion.button>
  );
}
