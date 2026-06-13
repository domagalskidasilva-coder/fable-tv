import { useState } from "react";
import type { MediaCard } from "../lib/types";
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
  const url = imageSrc(card.image);
  const hasArt = !!url && !failed;

  const ref = useGsap<HTMLDivElement>(
    (self) => {
      const bg = self.querySelector("[data-hero-bg]");
      const poster = self.querySelector("[data-hero-poster]");
      const content = self.querySelectorAll("[data-hero-item]");
      const tl = gsap.timeline();
      if (bg) {
        tl.fromTo(bg, { autoAlpha: 0, scale: 1.18 }, { autoAlpha: 1, scale: 1, duration: 1.4, ease: EASE.soft }, 0);
        gsap.to(bg, { scale: 1.08, duration: 16, ease: "none", repeat: -1, yoyo: true, delay: 1.4 });
      }
      tl.from(content, { autoAlpha: 0, y: 30, duration: 0.6, stagger: 0.1, ease: EASE.out }, 0.3);
      if (poster) tl.from(poster, { autoAlpha: 0, x: 40, scale: 0.92, duration: 0.7, ease: EASE.pop }, 0.35);
    },
    [card.itemType, card.id],
  );

  return (
    <div ref={ref} className="relative h-[64vh] min-h-[440px] w-full overflow-hidden">
      {/* Ambient blurred backdrop (handles poster-shaped art gracefully) */}
      <div data-hero-bg className="absolute inset-0">
        {hasArt ? (
          <img
            src={url}
            alt=""
            onError={() => setFailed(true)}
            className="h-full w-full scale-110 object-cover object-center opacity-50 blur-2xl"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent/40 via-bg-2 to-bg" />
        )}
        <div className="absolute inset-0 bg-bg/20" />
      </div>

      {/* Cinematic scrims */}
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/75 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-bg/35" />

      <div className="absolute inset-0 flex items-center">
        <div className="flex w-full items-center justify-between gap-8 px-6 md:px-12">
          <div className="max-w-xl">
            <span data-hero-item className="eyebrow mb-3 block text-accent-strong">
              {t(TYPE_LABEL[card.itemType] ?? "search.movies")}
            </span>
            <h1
              data-hero-item
              className="font-display mb-3 text-5xl font-black leading-[0.98] tracking-cine text-ink text-shadow md:text-7xl"
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
                className="flex items-center gap-2 rounded-xl bg-white/15 px-6 py-3 text-base font-semibold text-ink backdrop-blur transition-colors hover:bg-white/25"
              >
                <InfoIcon />
                {t("common.moreInfo")}
              </button>
            </div>
          </div>

          {/* Crisp contained poster on the right (desktop) */}
          {hasArt && (
            <div
              data-hero-poster
              className="hidden aspect-[2/3] w-52 shrink-0 overflow-hidden rounded-2xl border border-line/60 shadow-2xl lg:block"
            >
              <img src={url} alt={card.name} className="h-full w-full object-cover" draggable={false} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
