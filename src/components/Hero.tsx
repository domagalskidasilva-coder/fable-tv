import { useState } from "react";
import type { MediaCard } from "../lib/types";
import { useI18n } from "../lib/i18n";
import { cx, imageSrc } from "../lib/utils";
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
  const url = imageSrc(card.image);

  const ref = useGsap<HTMLDivElement>(
    (self) => {
      const bg = self.querySelector("[data-hero-bg]");
      const content = self.querySelectorAll("[data-hero-item]");
      const tl = gsap.timeline();
      if (bg) {
        tl.fromTo(
          bg,
          { autoAlpha: 0, scale: 1.15 },
          { autoAlpha: 1, scale: 1, duration: 1.4, ease: EASE.soft },
          0,
        );
        // Slow continuous drift for a living backdrop.
        gsap.to(bg, { scale: 1.08, duration: 14, ease: "none", repeat: -1, yoyo: true, delay: 1.4 });
      }
      tl.from(content, { autoAlpha: 0, y: 30, duration: 0.6, stagger: 0.1, ease: EASE.out }, 0.3);
    },
    [card.itemType, card.id],
  );

  return (
    <div ref={ref} className="relative -mt-0 h-[64vh] min-h-[420px] w-full overflow-hidden">
      <div data-hero-bg className="absolute inset-0">
        {url && !failed ? (
          <img
            src={url}
            alt=""
            onError={() => setFailed(true)}
            className="h-full w-full object-cover object-center"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent/30 via-bg-2 to-bg" />
        )}
      </div>

      {/* Cinematic gradient scrims */}
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/10 to-bg/40" />

      <div className="absolute inset-0 flex items-end md:items-center">
        <div className="w-full max-w-2xl px-6 pb-10 md:px-12 md:pb-0">
          <span
            data-hero-item
            className="mb-3 inline-block rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-accent-strong"
          >
            {t(TYPE_LABEL[card.itemType] ?? "search.movies")}
          </span>
          <h1
            data-hero-item
            className="mb-3 text-4xl font-black leading-tight tracking-tight text-ink text-shadow md:text-6xl"
          >
            {card.name}
          </h1>
          {card.subtitle && (
            <p data-hero-item className="mb-6 max-w-lg text-sm text-ink-dim text-shadow-sm md:text-base">
              {card.subtitle}
            </p>
          )}
          <div data-hero-item className="flex flex-wrap gap-3">
            <button
              data-nav
              onClick={() => onPlay(card)}
              className="flex items-center gap-2 rounded-xl bg-white px-7 py-3 text-base font-bold text-black shadow-xl transition-transform hover:scale-105 active:scale-95"
              autoFocus
            >
              <PlayIcon />
              {t("common.play")}
            </button>
            <button
              data-nav
              onClick={() => onInfo(card)}
              className={cx(
                "flex items-center gap-2 rounded-xl px-6 py-3 text-base font-semibold backdrop-blur transition-colors",
                "bg-white/15 text-ink hover:bg-white/25",
              )}
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
