import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, HeartIcon, PlayIcon, Spinner } from "../components/ui";
import { getMovieDetail, toggleFavorite } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { MovieDetail as MovieDetailType } from "../lib/types";
import { formatDuration, imageSrc, progressOf } from "../lib/utils";

export default function MovieDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<MovieDetailType | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    getMovieDetail(Number(id))
      .then(setMovie)
      .catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-ink-dim">{t("common.error")}</p>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          {t("common.back")}
        </Button>
      </div>
    );
  }
  if (!movie) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const cover = imageSrc(movie.image);
  const progress = progressOf(movie.positionSecs, movie.watchedDurationSecs);

  return (
    <div className="relative h-full overflow-y-auto">
      {cover && (
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <img src={cover} alt="" className="h-full w-full scale-110 object-cover opacity-20 blur-2xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/80 to-bg/40" />
        </div>
      )}

      <div className="mx-auto flex max-w-5xl flex-col gap-8 p-8 md:flex-row md:items-start">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-52 shrink-0 self-center md:self-start"
        >
          <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-2xl">
            {cover ? (
              <img src={cover} alt={movie.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-4xl font-black text-ink-dim/40">
                {movie.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="flex-1"
        >
          <button
            data-nav
            onClick={() => navigate(-1)}
            className="mb-4 text-sm font-semibold text-ink-dim hover:text-ink"
          >
            ← {t("common.back")}
          </button>
          <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-ink">{movie.name}</h1>
          <p className="mb-4 flex flex-wrap gap-3 text-sm text-ink-dim">
            {movie.year && <span>{movie.year}</span>}
            {movie.durationSecs ? <span>{formatDuration(movie.durationSecs)}</span> : null}
            {movie.rating && <span>★ {movie.rating}</span>}
            {movie.genre && <span>{movie.genre}</span>}
          </p>
          {movie.plot && <p className="mb-6 max-w-2xl leading-relaxed text-ink-dim">{movie.plot}</p>}

          {progress !== null && (
            <div className="mb-4 max-w-sm">
              <div className="h-1.5 overflow-hidden rounded bg-line">
                <div className="h-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => navigate(`/player/movie/${movie.id}`)}
              className="flex items-center gap-2 px-6 py-3 text-base"
              autoFocus
            >
              <PlayIcon />
              {progress !== null ? t("common.resume") : t("common.play")}
            </Button>
            <Button
              variant={movie.favorite ? "danger" : "ghost"}
              onClick={async () => {
                const fav = await toggleFavorite("movie", movie.id);
                setMovie({ ...movie, favorite: fav });
              }}
              className="flex items-center gap-2 px-4 py-3"
            >
              <HeartIcon filled={movie.favorite} />
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
