import { useEffect, useState } from "react";
import { getMovieDetail } from "../lib/api";
import type { MediaCard, MovieDetail } from "../lib/types";
import { useI18n } from "../lib/i18n";
import { imageSrc } from "../lib/utils";
import { EASE, gsap, useGsap } from "../lib/gsap";
import { InfoIcon, PlayIcon } from "./ui";

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

  // Only movies get a cheap detail fetch (series detail would trigger an
  // on-demand episode sync just to show a synopsis).
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
        tl.fromTo(bg, { autoAlpha: 0, scale: 1.18 }, { autoAlpha: 1, scale: 1, duration: 1.4, ease: EASE.soft }, 0);
        gsap.to(bg, { scale: 1.08, duration: 18, ease: "none", repeat: -1, yoyo: true, delay: 1.4 });
      }
      if (poster) tl.from(poster, { autoAlpha: 0, xPercent: 8, duration: 0.9, ease: EASE.soft }, 0.1);
      tl.from(content, { autoAlpha: 0, y: 28, duration: 0.6, stagger: 0.09, ease: EASE.out }, 0.3);
    },
    [card.itemType, card.id],
  );

  const year = detail?.year ?? null;
  const genre = detail?.genre ?? (card.itemType === "movie" ? null : card.subtitle);
  const rating = detail?.rating ?? null;
  const plot = detail?.plot ?? null;

  return (
    <div ref={ref} className="relative h-[72vh] min-h-[460px] w-full overflow-hidden">
      {/* Blurred ambient fill (letterbox behind the crisp poster) */}
      <div data-hero-bg className="absolute inset-0">
        {hasArt ? (
          <img
            src={url}
            alt=""
            onError={() => setFailed(true)}
            className="h-full w-full scale-110 object-cover object-center opacity-40 blur-2xl"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent/25 via-bg-2 to-bg" />
        )}
      </div>

      {/* Crisp poster anchored right, blended into the canvas */}
      {hasArt && (
        <div data-hero-poster className="absolute right-0 top-0 hidden h-full max-w-[56%] sm:block" style={{ aspectRatio: "2 / 3" }}>
          <img src={url} alt={card.name} className="h-full w-full object-cover" draggable={false} />
          <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/10 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent" />
        </div>
      )}

      {/* Legibility scrims */}
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/5 to-transparent" />

      <div className="absolute inset-0 flex items-end">
        <div className="w-full max-w-2xl px-6 pb-[8%] md:px-12">
          <span data-hero-item className="eyebrow mb-3 block text-accent-strong">
            {t(TYPE_LABEL[card.itemType] ?? "search.movies")}
          </span>
          <h1
            data-hero-item
            className="font-display mb-3 text-5xl font-black leading-[0.95] tracking-cine text-ink text-shadow md:text-7xl"
          >
            {card.name}
          </h1>

          {(year || genre || rating) && (
            <p data-hero-item className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-ink-dim">
              {year && <span className="tabular">{year}</span>}
              {rating && <span className="text-gold">★ {rating}</span>}
              {genre && <span className="rounded bg-white/10 px-2 py-0.5 text-xs">{genre}</span>}
            </p>
          )}

          {plot && (
            <p data-hero-item className="mb-6 line-clamp-3 max-w-lg text-sm leading-relaxed text-ink-dim text-shadow-sm md:text-base">
              {plot}
            </p>
          )}

          <div data-hero-item className="flex flex-wrap gap-3">
            <button
              data-nav
              onClick={() => onPlay(card)}
              className="flex items-center gap-2 rounded-md bg-white px-7 py-3 text-base font-bold text-black transition-transform hover:scale-[1.03] active:scale-95"
              autoFocus
            >
              <PlayIcon />
              {t("common.play")}
            </button>
            <button
              data-nav
              onClick={() => onInfo(card)}
              className="flex items-center gap-2 rounded-md bg-white/15 px-6 py-3 text-base font-semibold text-ink backdrop-blur transition-colors hover:bg-white/25"
            >
              <InfoIcon />
              {t("common.moreInfo")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
