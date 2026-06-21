import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, HeartIcon, PlayIcon, Spinner } from "../components/ui";
import { getMovieDetail, toggleFavorite } from "../lib/api";
import { EASE, gsap, useGsap } from "../lib/gsap";
import { useI18n } from "../lib/i18n";
import type { MovieDetail as MovieDetailType } from "../lib/types";
import { cx, formatDuration, imageSrc, progressOf } from "../lib/utils";

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
  const backdrop = imageSrc(movie.backdrop);
  const genres = (movie.genre ?? "").split(/[,|/]/).map((g) => g.trim()).filter(Boolean);
  const progress = progressOf(movie.positionSecs, movie.watchedDurationSecs);

  return (
    <div ref={ref} className="relative h-full overflow-y-auto">
      {(backdrop || cover) && (
        <div data-bg className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] overflow-hidden">
          <img
            src={backdrop ?? cover ?? undefined}
            alt=""
            className={cx(
              "h-full w-full scale-105 object-cover object-top",
              backdrop ? "opacity-40" : "opacity-25 blur-2xl",
            )}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/80 to-bg/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-bg/60 to-transparent" />
        </div>
      )}

      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-5 pt-8 sm:gap-8 sm:p-8 sm:pt-10 md:flex-row md:items-start">
        <div data-reveal className="w-40 shrink-0 self-center sm:w-52 md:self-start">
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
            className="mb-4 -ml-1 inline-flex items-center gap-1 py-1.5 text-sm font-semibold text-ink-dim transition-colors hover:text-ink"
          >
            ← {t("common.back")}
          </button>
          <h1 data-reveal className="mb-2 text-3xl font-black tracking-tight text-ink md:text-5xl">
            {movie.name}
          </h1>
          <p data-reveal className="mb-4 flex flex-wrap items-center gap-3 text-sm text-ink-dim">
            {movie.year && <span className="tabular">{movie.year}</span>}
            {movie.durationSecs ? <span>{formatDuration(movie.durationSecs)}</span> : null}
            {movie.rating && <span className="text-gold">★ {movie.rating}</span>}
            {movie.country && <span>{movie.country}</span>}
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
          {movie.plot && (
            <p data-reveal className="mb-4 max-w-2xl leading-relaxed text-ink-dim">
              {movie.plot}
            </p>
          )}
          {(movie.cast.length > 0 || movie.director) && (
            <div data-reveal className="mb-6 space-y-1 text-sm text-ink-dim">
              {movie.cast.length > 0 && (
                <p>
                  <span className="text-ink-faint">{t("detail.cast")}: </span>
                  {movie.cast.slice(0, 6).join(", ")}
                </p>
              )}
              {movie.director && (
                <p>
                  <span className="text-ink-faint">{t("detail.director")}: </span>
                  {movie.director}
                </p>
              )}
            </div>
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
