import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, HeartIcon, PlayIcon, Spinner } from "../components/ui";
import { getMovieDetail, toggleFavorite } from "../lib/api";
import { EASE, gsap, useGsap } from "../lib/gsap";
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
    setMovie(null);
    setError(false);
    getMovieDetail(Number(id))
      .then(setMovie)
      .catch(() => setError(true));
  }, [id]);

  const ref = useGsap<HTMLDivElement>(
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
    [movie?.id],
  );

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
    <div ref={ref} className="relative h-full overflow-y-auto">
      {cover && (
        <div data-bg className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <img src={cover} alt="" className="h-full w-full scale-110 object-cover opacity-25 blur-2xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/85 to-bg/40" />
        </div>
      )}

      <div className="mx-auto flex max-w-5xl flex-col gap-8 p-8 pt-10 md:flex-row md:items-start">
        <div data-reveal className="w-52 shrink-0 self-center md:self-start">
          <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-2xl">
            {cover ? (
              <img src={cover} alt={movie.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-4xl font-black text-ink-faint">
                {movie.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1">
          <button
            data-nav
            data-reveal
            onClick={() => navigate(-1)}
            className="mb-4 text-sm font-semibold text-ink-dim transition-colors hover:text-ink"
          >
            ← {t("common.back")}
          </button>
          <h1 data-reveal className="mb-2 text-3xl font-black tracking-tight text-ink md:text-5xl">
            {movie.name}
          </h1>
          <p data-reveal className="mb-4 flex flex-wrap items-center gap-3 text-sm text-ink-dim">
            {movie.year && <span>{movie.year}</span>}
            {movie.durationSecs ? <span>{formatDuration(movie.durationSecs)}</span> : null}
            {movie.rating && <span className="text-gold">★ {movie.rating}</span>}
            {movie.genre && <span className="rounded-full bg-surface px-2.5 py-0.5">{movie.genre}</span>}
          </p>
          {movie.plot && (
            <p data-reveal className="mb-6 max-w-2xl leading-relaxed text-ink-dim">
              {movie.plot}
            </p>
          )}

          {progress !== null && (
            <div data-reveal className="mb-5 max-w-sm">
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}

          <div data-reveal className="flex flex-wrap gap-3">
            <Button
              variant="light"
              onClick={() => navigate(`/player/movie/${movie.id}`)}
              className="flex items-center gap-2 px-7 py-3 text-base"
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
        </div>
      </div>
    </div>
  );
}
