import { useCallback, useEffect, useState } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import { ChannelCard, ContinueCard, PosterCard } from "../components/Cards";
import { Hero } from "../components/Hero";
import { RankedRow } from "../components/RankedRow";
import { Row, RowItem } from "../components/Row";
import { Button, SkeletonRow } from "../components/ui";
import { getHomeData, startSync } from "../lib/api";
import { EASE, gsap, useGsap } from "../lib/gsap";
import { useI18n } from "../lib/i18n";
import type { HomeData, MediaCard } from "../lib/types";
import { formatDateTime } from "../lib/utils";

/** Opens the detail page (or player for live/episode). */
export function openCard(navigate: NavigateFunction, card: MediaCard) {
  switch (card.itemType) {
    case "channel":
    case "episode":
      navigate(`/player/${card.itemType}/${card.id}`);
      break;
    case "movie":
      navigate(`/movie/${card.id}`);
      break;
    case "series":
      navigate(`/series/${card.seriesId ?? card.id}`);
      break;
  }
}

/** Starts playback directly where possible; series open detail to pick an episode. */
export function playCard(navigate: NavigateFunction, card: MediaCard) {
  switch (card.itemType) {
    case "movie":
    case "channel":
    case "episode":
      navigate(`/player/${card.itemType}/${card.id}`);
      break;
    case "series":
      navigate(`/series/${card.seriesId ?? card.id}`);
      break;
  }
}

function pickFeatured(data: HomeData): MediaCard | null {
  // Prefer a movie so the billboard can show a real synopsis (cheap detail
  // fetch); fall back through the other rows otherwise.
  const cw = data.continueWatching[0];
  if (cw?.itemType === "movie") return cw;
  return (
    data.latestMovies[0] ??
    cw ??
    data.latestSeries[0] ??
    data.favorites[0] ??
    data.recentChannels[0] ??
    null
  );
}

export default function Home() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState<HomeData | null>(null);

  const load = useCallback(() => {
    getHomeData().then(setData).catch(() => setData(null));
  }, []);
  useEffect(load, [load]);

  // Keep the home fresh after syncs/imports happen in other windows or while
  // the app was in the background.
  useEffect(() => {
    const onFocus = () => load();
    const onVisible = () => document.visibilityState === "visible" && load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const rowsRef = useGsap<HTMLDivElement>(
    (self) => {
      const reveals = self.querySelectorAll("[data-reveal]");
      gsap.from(reveals, {
        autoAlpha: 0,
        y: 28,
        duration: 0.5,
        stagger: 0.07,
        ease: EASE.out,
      });
    },
    [data ? "ready" : "loading"],
  );

  const welcomeRef = useGsap<HTMLDivElement>((self) => {
    gsap.from(self.children, { autoAlpha: 0, y: 24, stagger: 0.1, duration: 0.6, ease: EASE.out });
  });

  const open = (c: MediaCard) => openCard(navigate, c);

  if (!data) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="skeleton h-[64vh] min-h-[420px] w-full" />
        <div className="space-y-8 p-6">
          <SkeletonRow poster />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  const featured = pickFeatured(data);
  const isEmpty = data.sources.length === 0 && !featured;

  if (isEmpty) {
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden p-8">
        <div ref={welcomeRef} className="max-w-xl text-center">
          <div className="mx-auto mb-7 grid h-16 w-16 place-items-center rounded-2xl bg-brand text-3xl font-black">
            F
          </div>
          <p className="eyebrow mb-4">Fable</p>
          <h1 className="font-display mb-4 text-4xl font-black leading-[1.02] tracking-cine text-ink md:text-5xl">
            {t("home.welcome")}
          </h1>
          <p className="mx-auto mb-8 max-w-md leading-relaxed text-ink-dim">{t("home.welcomeSub")}</p>
          <Button onClick={() => navigate("/profiles")} className="px-8 py-3.5 text-base" autoFocus>
            {t("home.addFirstSource")}
          </Button>
          <p className="mx-auto mt-8 max-w-md text-xs leading-relaxed text-ink-faint">{t("sources.legal")}</p>
        </div>
      </div>
    );
  }

  const seeAll = (to: string) => (
    <button
      data-nav
      onClick={() => navigate(to)}
      className="text-xs font-semibold text-ink-dim transition-colors hover:text-accent-strong"
    >
      {t("common.seeAll")} ›
    </button>
  );

  // "Top 10" uses a heuristic order (most recently added), interleaving movies
  // and series — there is no real popularity signal in a local library.
  const top10: MediaCard[] = [];
  for (let i = 0; i < 10; i++) {
    if (data.latestMovies[i]) top10.push(data.latestMovies[i]);
    if (data.latestSeries[i]) top10.push(data.latestSeries[i]);
  }
  const top10List = top10.slice(0, 10);

  return (
    <div className="h-full overflow-y-auto">
      {featured && (
        <Hero
          card={featured}
          onPlay={(c) => playCard(navigate, c)}
          onInfo={(c) => openCard(navigate, c)}
        />
      )}

      <div ref={rowsRef} className="relative z-10 -mt-12 px-6 pb-16 md:px-10">
        {data.continueWatching.length > 0 && (
          <Row title={t("home.continueWatching")}>
            {data.continueWatching.map((c) => (
              <ContinueCard key={`${c.itemType}-${c.id}`} card={c} onOpen={open} />
            ))}
          </Row>
        )}

        {data.favorites.length > 0 && (
          <Row title={t("home.favorites")} action={seeAll("/favorites")}>
            {data.favorites.map((c) =>
              c.itemType === "channel" ? (
                <RowItem key={`${c.itemType}-${c.id}`} width="w-56">
                  <ChannelCard card={c} onOpen={open} />
                </RowItem>
              ) : (
                <RowItem key={`${c.itemType}-${c.id}`}>
                  <PosterCard card={c} onOpen={open} />
                </RowItem>
              ),
            )}
          </Row>
        )}

        {top10List.length >= 3 && (
          <RankedRow title={t("home.top10")} cards={top10List} onOpen={open} />
        )}

        {data.recentChannels.length > 0 && (
          <Row title={t("home.recentChannels")} action={seeAll("/live")}>
            {data.recentChannels.map((c) => (
              <RowItem key={c.id} width="w-56">
                <ChannelCard card={c} onOpen={open} />
              </RowItem>
            ))}
          </Row>
        )}

        {data.latestMovies.length > 0 && (
          <Row title={t("home.latestMovies")} action={seeAll("/movies")}>
            {data.latestMovies.map((c) => (
              <RowItem key={c.id}>
                <PosterCard card={c} onOpen={open} />
              </RowItem>
            ))}
          </Row>
        )}

        {data.latestSeries.length > 0 && (
          <Row title={t("home.latestSeries")} action={seeAll("/series")}>
            {data.latestSeries.map((c) => (
              <RowItem key={c.id}>
                <PosterCard card={c} onOpen={open} />
              </RowItem>
            ))}
          </Row>
        )}

        {data.liveCategories.length > 0 && (
          <Row title={t("home.categories")}>
            {data.liveCategories.map((cat) => (
              <button
                key={cat.id}
                data-nav
                onClick={() => navigate(`/live?category=${cat.id}`)}
                className="flex h-24 w-48 shrink-0 flex-col justify-between overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-surface-2 to-surface p-4 text-left shadow-md transition-transform hover:scale-[1.03] hover:border-accent/50"
              >
                <span className="line-clamp-2 text-sm font-bold text-ink">{cat.name}</span>
                <span className="text-xs text-ink-dim">{t("common.items", { n: cat.itemCount })}</span>
              </button>
            ))}
          </Row>
        )}

        {data.sources.length > 0 && (
          <Row title={t("home.sources")} action={seeAll("/sources")}>
            {data.sources.map((s) => (
              <div
                key={s.id}
                className="w-72 shrink-0 rounded-2xl border border-line bg-surface/80 p-4 shadow-md backdrop-blur"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate font-bold text-ink">{s.name}</p>
                  <button
                    data-nav
                    onClick={() =>
                      startSync(s.id, {
                        channels: true,
                        movies: true,
                        series: true,
                        epg: false,
                        logos: false,
                      }).catch(() => undefined)
                    }
                    className="shrink-0 rounded-lg bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-strong transition-colors hover:bg-accent hover:text-white"
                  >
                    {t("home.syncNow")}
                  </button>
                </div>
                <p className="text-xs text-ink-dim">
                  {t("home.channels", { n: s.channelCount })} · {t("home.movies", { n: s.movieCount })} ·{" "}
                  {t("home.series", { n: s.seriesCount })}
                </p>
                <p className="mt-1 text-xs text-ink-faint">
                  {t("home.lastSync", {
                    when: s.lastSyncAt ? formatDateTime(s.lastSyncAt, lang) : t("common.never"),
                  })}
                </p>
              </div>
            ))}
          </Row>
        )}
      </div>
    </div>
  );
}
