import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, HeartIcon, PlayIcon, Spinner } from "../components/ui";
import { getSeriesDetail, toggleFavorite } from "../lib/api";
import { EASE, gsap, useGsap } from "../lib/gsap";
import { useI18n } from "../lib/i18n";
import type { SeriesDetail as SeriesDetailType } from "../lib/types";
import { cx, formatDuration, imageSrc, progressOf } from "../lib/utils";

export default function SeriesDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [series, setSeries] = useState<SeriesDetailType | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setSeries(null);
    setError(null);
    getSeriesDetail(Number(id))
      .then((s) => {
        setSeries(s);
        const inProgress = s.seasons.find((se) =>
          se.episodes.some((e) => (e.positionSecs ?? 0) > 30 && !e.completed),
        );
        setSeason(inProgress?.season ?? s.seasons[0]?.season ?? null);
      })
      .catch((e) => setError(String(e)));
  }, [id]);

  const headRef = useGsap<HTMLDivElement>(
    (self) => {
      const bg = self.querySelector("[data-bg]");
      if (bg) gsap.from(bg, { autoAlpha: 0, scale: 1.1, duration: 1.2, ease: EASE.soft });
      gsap.from(self.querySelectorAll("[data-reveal]"), {
        autoAlpha: 0,
        y: 26,
        stagger: 0.08,
        duration: 0.55,
        delay: 0.15,
        ease: EASE.out,
      });
    },
    [series?.id],
  );

  // Re-stagger the episode list whenever the season changes.
  const listRef = useGsap<HTMLDivElement>(
    (self) => {
      gsap.from(self.children, {
        autoAlpha: 0,
        y: 16,
        stagger: 0.03,
        duration: 0.4,
        ease: EASE.out,
      });
    },
    [season, series?.id],
  );

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="font-semibold text-ink">{t("common.error")}</p>
        <p className="max-w-md text-sm text-ink-dim">{error}</p>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          {t("common.back")}
        </Button>
      </div>
    );
  }
  if (!series) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const cover = imageSrc(series.cover);
  const current = series.seasons.find((s) => s.season === season) ?? series.seasons[0];
  const firstUnwatched =
    series.seasons.flatMap((s) => s.episodes).find((e) => !e.completed) ??
    series.seasons[0]?.episodes[0];

  return (
    <div ref={headRef} className="relative h-full overflow-y-auto">
      {cover && (
        <div data-bg className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] overflow-hidden">
          <img src={cover} alt="" className="h-full w-full scale-110 object-cover opacity-25 blur-xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/75 to-bg/30" />
        </div>
      )}

      <div className="mx-auto max-w-5xl p-8 pt-10">
        <button
          data-nav
          data-reveal
          onClick={() => navigate(-1)}
          className="mb-4 text-sm font-semibold text-ink-dim transition-colors hover:text-ink"
        >
          ← {t("common.back")}
        </button>

        <div className="mb-8 flex flex-col gap-6 md:flex-row">
          <div data-reveal className="w-44 shrink-0 self-center md:self-start">
            <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-2xl">
              {cover ? (
                <img src={cover} alt={series.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-4xl font-black text-ink-faint">
                  {series.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div className="flex-1">
            <h1 data-reveal className="mb-2 text-3xl font-black tracking-tight text-ink md:text-5xl">
              {series.name}
            </h1>
            <p data-reveal className="mb-3 flex flex-wrap items-center gap-3 text-sm text-ink-dim">
              {series.year && <span>{series.year}</span>}
              {series.rating && <span className="text-gold">★ {series.rating}</span>}
              {series.genre && <span className="rounded-full bg-surface px-2.5 py-0.5">{series.genre}</span>}
            </p>
            {series.plot && (
              <p data-reveal className="mb-5 max-w-2xl text-sm leading-relaxed text-ink-dim">
                {series.plot}
              </p>
            )}
            <div data-reveal className="flex flex-wrap gap-3">
              {firstUnwatched && (
                <Button
                  variant="light"
                  onClick={() => navigate(`/player/episode/${firstUnwatched.id}`)}
                  className="flex items-center gap-2 px-7 py-3"
                  autoFocus
                >
                  <PlayIcon />
                  {t("common.play")}
                </Button>
              )}
              <Button
                variant={series.favorite ? "danger" : "ghost"}
                onClick={async () => {
                  const fav = await toggleFavorite("series", series.id);
                  setSeries({ ...series, favorite: fav });
                }}
                className="flex items-center gap-2 px-4 py-3"
              >
                <HeartIcon filled={series.favorite} />
              </Button>
            </div>
          </div>
        </div>

        <div data-reveal className="hide-scrollbar mb-4 flex gap-2 overflow-x-auto">
          {series.seasons.map((s) => (
            <button
              key={s.season}
              data-nav
              onClick={() => setSeason(s.season)}
              className={cx(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                s.season === current?.season
                  ? "bg-brand text-white"
                  : "bg-surface text-ink-dim hover:bg-surface-hover",
              )}
            >
              {t("series.season", { n: s.season })}
            </button>
          ))}
          {current && (
            <span className="ml-2 self-center text-xs text-ink-dim">
              {t("series.episodes", { n: current.episodes.length })}
            </span>
          )}
        </div>

        <div ref={listRef} className="flex flex-col gap-2 pb-10">
          {current?.episodes.map((ep) => {
            const progress = progressOf(ep.positionSecs, ep.watchedDurationSecs);
            return (
              <button
                key={ep.id}
                data-nav
                onClick={() => navigate(`/player/episode/${ep.id}`)}
                className="group flex items-center gap-4 rounded-2xl border border-line bg-surface/80 p-3 text-left transition-colors hover:bg-surface-hover"
              >
                <span className="w-8 shrink-0 text-center text-lg font-bold text-ink-faint">
                  {ep.episodeNum}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{ep.name}</p>
                  <p className="flex gap-3 text-xs text-ink-dim">
                    {ep.durationSecs ? <span>{formatDuration(ep.durationSecs)}</span> : null}
                    {ep.completed && <span className="text-ok">{t("series.watched")}</span>}
                  </p>
                  {progress !== null && !ep.completed && (
                    <div className="mt-1.5 h-1 max-w-xs overflow-hidden rounded-full bg-line">
                      <div className="h-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                  )}
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <PlayIcon size={16} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
