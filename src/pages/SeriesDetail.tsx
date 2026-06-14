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
  const backdrop = imageSrc(series.backdrop);
  const genres = (series.genre ?? "").split(/[,|/]/).map((g) => g.trim()).filter(Boolean);
  const current = series.seasons.find((s) => s.season === season) ?? series.seasons[0];
  const firstUnwatched =
    series.seasons.flatMap((s) => s.episodes).find((e) => !e.completed) ??
    series.seasons[0]?.episodes[0];

  return (
    <div ref={headRef} className="relative h-full overflow-y-auto">
      {(backdrop || cover) && (
        <div data-bg className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem] overflow-hidden">
          <img
            src={backdrop ?? cover ?? undefined}
            alt=""
            className={cx(
              "h-full w-full scale-105 object-cover object-top",
              backdrop ? "opacity-40" : "opacity-25 blur-xl",
            )}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/80 to-bg/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-bg/60 to-transparent" />
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
              {series.year && <span className="tabular">{series.year}</span>}
              {series.rating && <span className="text-gold">★ {series.rating}</span>}
              <span>{t("series.episodes", { n: series.seasons.reduce((a, s) => a + s.episodes.length, 0) })}</span>
            </p>
            {genres.length > 0 && (
              <div data-reveal className="mb-4 flex flex-wrap gap-2">
                {genres.map((g) => (
                  <span key={g} className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-dim">
                    {g}
                  </span>
                ))}
              </div>
            )}
            {series.plot && (
              <p data-reveal className="mb-4 max-w-2xl text-sm leading-relaxed text-ink-dim">
                {series.plot}
              </p>
            )}
            {(series.cast.length > 0 || series.director) && (
              <div data-reveal className="mb-5 space-y-1 text-sm text-ink-dim">
                {series.cast.length > 0 && (
                  <p>
                    <span className="text-ink-faint">{t("detail.cast")}: </span>
                    {series.cast.slice(0, 6).join(", ")}
                  </p>
                )}
                {series.director && (
                  <p>
                    <span className="text-ink-faint">{t("detail.director")}: </span>
                    {series.director}
                  </p>
                )}
              </div>
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

        <div ref={listRef} className="flex flex-col gap-2.5 pb-10">
          {current?.episodes.map((ep) => {
            const progress = progressOf(ep.positionSecs, ep.watchedDurationSecs);
            const thumb = imageSrc(ep.thumbnail) ?? cover;
            return (
              <button
                key={ep.id}
                data-nav
                onClick={() => navigate(`/player/episode/${ep.id}`)}
                className="group flex items-stretch gap-4 rounded-xl border border-line bg-surface/70 p-3 text-left transition-colors hover:bg-surface-hover"
              >
                <span className="hidden w-6 shrink-0 items-center justify-center self-center text-lg font-bold text-ink-faint sm:flex">
                  {ep.episodeNum}
                </span>
                <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-md bg-surface-2">
                  {thumb ? (
                    <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-ink-faint">
                      <PlayIcon />
                    </div>
                  )}
                  <div className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-black shadow-lg">
                      <PlayIcon size={16} />
                    </span>
                  </div>
                  {ep.completed && (
                    <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ok text-bg">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                  {progress !== null && !ep.completed && (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                      <div className="h-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 self-center">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold text-ink">
                      <span className="text-ink-faint sm:hidden">{ep.episodeNum}. </span>
                      {ep.name}
                    </p>
                    {ep.durationSecs ? (
                      <span className="shrink-0 text-xs text-ink-dim">{formatDuration(ep.durationSecs)}</span>
                    ) : null}
                  </div>
                  {ep.plot && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-ink-dim">{ep.plot}</p>
                  )}
                  {ep.completed && <span className="text-xs text-ok">{t("series.watched")}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
