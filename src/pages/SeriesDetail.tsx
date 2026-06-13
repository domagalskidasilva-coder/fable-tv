import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, HeartIcon, PlayIcon, Spinner } from "../components/ui";
import { getSeriesDetail, toggleFavorite } from "../lib/api";
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
        // Open the season the user is most likely to continue.
        const inProgress = s.seasons.find((se) =>
          se.episodes.some((e) => (e.positionSecs ?? 0) > 30 && !e.completed),
        );
        setSeason(inProgress?.season ?? s.seasons[0]?.season ?? null);
      })
      .catch((e) => setError(String(e)));
  }, [id]);

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
    <div className="relative h-full overflow-y-auto">
      {cover && (
        <div className="absolute inset-x-0 top-0 -z-10 h-96 overflow-hidden">
          <img src={cover} alt="" className="h-full w-full scale-110 object-cover opacity-25 blur-xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-bg/30" />
        </div>
      )}

      <div className="mx-auto max-w-5xl p-8">
        <button
          data-nav
          onClick={() => navigate(-1)}
          className="mb-4 text-sm font-semibold text-ink-dim hover:text-ink"
        >
          ← {t("common.back")}
        </button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col gap-6 md:flex-row"
        >
          <div className="w-44 shrink-0 self-center md:self-start">
            <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-2xl">
              {cover ? (
                <img src={cover} alt={series.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-4xl font-black text-ink-dim/40">
                  {series.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div className="flex-1">
            <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-ink">{series.name}</h1>
            <p className="mb-3 flex flex-wrap gap-3 text-sm text-ink-dim">
              {series.year && <span>{series.year}</span>}
              {series.rating && <span>★ {series.rating}</span>}
              {series.genre && <span>{series.genre}</span>}
            </p>
            {series.plot && (
              <p className="mb-5 max-w-2xl text-sm leading-relaxed text-ink-dim">{series.plot}</p>
            )}
            <div className="flex flex-wrap gap-3">
              {firstUnwatched && (
                <Button
                  onClick={() => navigate(`/player/episode/${firstUnwatched.id}`)}
                  className="flex items-center gap-2 px-6 py-3"
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
        </motion.div>

        <div className="hide-scrollbar mb-4 flex gap-2 overflow-x-auto">
          {series.seasons.map((s) => (
            <button
              key={s.season}
              data-nav
              onClick={() => setSeason(s.season)}
              className={cx(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                s.season === current?.season
                  ? "bg-accent text-white"
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

        <div className="flex flex-col gap-2 pb-10">
          {current?.episodes.map((ep, i) => {
            const progress = progressOf(ep.positionSecs, ep.watchedDurationSecs);
            return (
              <motion.button
                key={ep.id}
                data-nav
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                onClick={() => navigate(`/player/episode/${ep.id}`)}
                className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-hover"
              >
                <span className="w-8 shrink-0 text-center text-lg font-bold text-ink-dim/60">
                  {ep.episodeNum}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{ep.name}</p>
                  <p className="flex gap-3 text-xs text-ink-dim">
                    {ep.durationSecs ? <span>{formatDuration(ep.durationSecs)}</span> : null}
                    {ep.completed && <span className="text-ok">{t("series.watched")}</span>}
                  </p>
                  {progress !== null && !ep.completed && (
                    <div className="mt-1.5 h-1 max-w-xs overflow-hidden rounded bg-line">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-accent-soft p-2.5 text-accent-strong opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <PlayIcon size={16} />
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
