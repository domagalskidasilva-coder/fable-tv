import { useEffect, useState } from "react";
import { getMovieDetail } from "../lib/api";
import type { MediaCard, MovieDetail } from "../lib/types";
import { useI18n } from "../lib/i18n";
import { imageSrc } from "../lib/utils";
import { EASE, gsap, useGsap } from "../lib/gsap";
import { InfoIcon, PlayIcon } from "./ui";
import { motion } from "framer-motion";

const TYPE_LABEL: Record<string, string> = {
  movie: "search.movies",
  series: "search.series",
  channel: "search.channels",
  episode: "search.episodes",
};

export function Hero({
  card,
  onPlay,
  onInfo,
}: {
  card: MediaCard;
  onPlay: (c: MediaCard) => void;
  onInfo: (c: MediaCard) => void;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState<MovieDetail | null>(null);
  const url = imageSrc(card.image);
  const hasArt = !!url && !failed;

  useEffect(() => {
    setDetail(null);
    if (card.itemType !== "movie") return;
    let cancelled = false;
    getMovieDetail(card.id)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [card.itemType, card.id]);

  const ref = useGsap<HTMLDivElement>(
    (self) => {
      const bg = self.querySelector("[data-hero-bg]");
      const poster = self.querySelector("[data-hero-poster]");
      const content = self.querySelectorAll("[data-hero-item]");
      const tl = gsap.timeline();
      if (bg) {
        tl.fromTo(bg, { autoAlpha: 0, scale: 1.18 }, { autoAlpha: 1, scale: 1, duration: 1.6, ease: EASE.soft }, 0);
        gsap.to(bg, { scale: 1.08, duration: 25, ease: "none", repeat: -1, yoyo: true, delay: 1.6 });
      }
      if (poster) {
        tl.fromTo(poster, { autoAlpha: 0, xPercent: 12 }, { autoAlpha: 1, xPercent: 0, duration: 1.2, ease: EASE.out }, 0.2);
      }
      tl.fromTo(content, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.1, ease: EASE.out }, 0.4);
    },
    [card.itemType, card.id],
  );

  const year = detail?.year ?? null;
  const genre = detail?.genre ?? (card.itemType === "movie" ? null : card.subtitle);
  const rating = detail?.rating ?? null;
  const plot = detail?.plot ?? null;

  return (
    <div ref={ref} className="relative h-[80vh] min-h-[560px] w-full overflow-hidden">
      {/* Cinematic ambient fill */}
      <div data-hero-bg className="absolute inset-0">
        {hasArt ? (
          <img
            src={url}
            alt=""
            onError={() => setFailed(true)}
            className="h-full w-full scale-110 object-cover object-center opacity-60 blur-3xl saturate-150"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent/30 via-bg-2 to-bg" />
        )}
      </div>

      {/* Crisp poster anchored right, blended into the canvas */}
      {hasArt && (
        <div data-hero-poster className="absolute right-0 top-0 hidden h-full w-[60%] sm:block">
          <img src={url} alt={card.name} className="h-full w-full object-cover" draggable={false} />
          {/* Deep cinematic fade from left */}
          <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent" />
        </div>
      )}

      {/* Legibility scrims for text overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-transparent w-full md:w-[70%]" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/10 to-transparent" />

      <div className="absolute inset-0 flex flex-col justify-end pt-[120px] pb-[8%] px-6 md:px-12 z-10">
        <div className="w-full max-w-3xl shrink-0">
          <span data-hero-item className="eyebrow mb-3 block text-accent-strong drop-shadow-md">
            {t(TYPE_LABEL[card.itemType] ?? "search.movies")}
          </span>
          <h1
            data-hero-item
            className="font-display mb-4 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-tight tracking-tight text-white text-shadow line-clamp-3"
          >
            {card.name}
          </h1>

          {(year || genre || rating) && (
            <p data-hero-item className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-ink-dim">
              {year && <span className="tabular tracking-wider">{year}</span>}
              {rating && <span className="text-gold font-bold flex items-center gap-1">★ {rating}</span>}
              {genre && <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs backdrop-blur-md shadow-inner border border-white/5">{genre}</span>}
            </p>
          )}

          {plot && (
            <p data-hero-item className="mb-8 line-clamp-3 max-w-xl text-base leading-relaxed text-ink-dim text-shadow-sm font-medium">
              {plot}
            </p>
          )}

          <div data-hero-item className="flex flex-wrap gap-4">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              data-nav
              onClick={() => onPlay(card)}
              className="flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-bold text-black shadow-xl shadow-white/10 transition-colors hover:bg-white/90"
              autoFocus
            >
              <PlayIcon />
              {t("common.play")}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04, backgroundColor: "rgba(255,255,255,0.25)" }}
              whileTap={{ scale: 0.96 }}
              data-nav
              onClick={() => onInfo(card)}
              className="flex items-center gap-2 rounded-xl bg-surface-2 px-7 py-3.5 text-base font-bold text-white backdrop-blur-xl border border-border-soft shadow-lg transition-colors hover:border-accent/50"
            >
              <InfoIcon />
              {t("common.moreInfo")}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
