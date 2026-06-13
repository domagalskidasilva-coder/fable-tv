import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChannelCard, ContinueCard, PosterCard } from "../components/Cards";
import { Row, RowItem } from "../components/Row";
import { Button, EmptyState, SkeletonRow } from "../components/ui";
import { getHomeData, startSync } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { HomeData, MediaCard } from "../lib/types";
import { formatDateTime } from "../lib/utils";

export function openCard(navigate: (to: string) => void, card: MediaCard) {
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

export default function Home() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState<HomeData | null>(null);

  const load = useCallback(() => {
    getHomeData().then(setData).catch(() => setData(null));
  }, []);

  useEffect(load, [load]);

  const open = (c: MediaCard) => openCard(navigate, c);

  if (!data) {
    return (
      <div className="h-full overflow-y-auto p-8">
        <div className="skeleton mb-8 h-10 w-72 rounded-xl" />
        <SkeletonRow />
        <div className="h-8" />
        <SkeletonRow poster />
      </div>
    );
  }

  const isEmpty =
    data.sources.length === 0 &&
    data.continueWatching.length === 0 &&
    data.recentChannels.length === 0;

  if (isEmpty) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-xl text-center"
        >
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-accent to-accent-strong text-4xl font-black text-white shadow-2xl">
            F
          </div>
          <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-ink">
            {t("home.welcome")}
          </h1>
          <p className="mb-8 text-ink-dim">{t("home.welcomeSub")}</p>
          <Button onClick={() => navigate("/sources")} className="px-6 py-3 text-base" autoFocus>
            {t("home.addFirstSource")}
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 pb-12 pt-8">
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-2xl font-extrabold tracking-tight text-ink"
      >
        Fable TV
      </motion.h1>

      {data.continueWatching.length > 0 && (
        <Row title={t("home.continueWatching")}>
          {data.continueWatching.map((c) => (
            <ContinueCard key={`${c.itemType}-${c.id}`} card={c} onOpen={open} />
          ))}
        </Row>
      )}

      {data.favorites.length > 0 && (
        <Row
          title={t("home.favorites")}
          action={
            <button
              data-nav
              onClick={() => navigate("/favorites")}
              className="text-xs font-semibold text-accent-strong hover:underline"
            >
              {t("common.seeAll")}
            </button>
          }
        >
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

      {data.recentChannels.length > 0 && (
        <Row
          title={t("home.recentChannels")}
          action={
            <button
              data-nav
              onClick={() => navigate("/live")}
              className="text-xs font-semibold text-accent-strong hover:underline"
            >
              {t("common.seeAll")}
            </button>
          }
        >
          {data.recentChannels.map((c) => (
            <RowItem key={c.id} width="w-56">
              <ChannelCard card={c} onOpen={open} />
            </RowItem>
          ))}
        </Row>
      )}

      {data.latestMovies.length > 0 && (
        <Row
          title={t("home.latestMovies")}
          action={
            <button
              data-nav
              onClick={() => navigate("/movies")}
              className="text-xs font-semibold text-accent-strong hover:underline"
            >
              {t("common.seeAll")}
            </button>
          }
        >
          {data.latestMovies.map((c) => (
            <RowItem key={c.id}>
              <PosterCard card={c} onOpen={open} />
            </RowItem>
          ))}
        </Row>
      )}

      {data.latestSeries.length > 0 && (
        <Row
          title={t("home.latestSeries")}
          action={
            <button
              data-nav
              onClick={() => navigate("/series")}
              className="text-xs font-semibold text-accent-strong hover:underline"
            >
              {t("common.seeAll")}
            </button>
          }
        >
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
            <motion.button
              key={cat.id}
              data-nav
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/live?category=${cat.id}`)}
              className="flex h-24 w-44 shrink-0 flex-col justify-between rounded-xl border border-line bg-gradient-to-br from-surface to-surface-hover p-4 text-left shadow-md"
            >
              <span className="line-clamp-2 text-sm font-bold text-ink">{cat.name}</span>
              <span className="text-xs text-ink-dim">
                {t("common.items", { n: cat.itemCount })}
              </span>
            </motion.button>
          ))}
        </Row>
      )}

      {data.sources.length > 0 && (
        <Row title={t("home.sources")}>
          {data.sources.map((s) => (
            <div
              key={s.id}
              className="w-72 shrink-0 rounded-xl border border-line bg-surface p-4 shadow-md"
            >
              <div className="mb-2 flex items-center justify-between">
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
                  className="rounded-lg bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-strong hover:bg-accent hover:text-white"
                >
                  {t("home.syncNow")}
                </button>
              </div>
              <p className="text-xs text-ink-dim">
                {t("home.channels", { n: s.channelCount })} ·{" "}
                {t("home.movies", { n: s.movieCount })} · {t("home.series", { n: s.seriesCount })}
              </p>
              <p className="mt-1 text-xs text-ink-dim/70">
                {t("home.lastSync", {
                  when: s.lastSyncAt ? formatDateTime(s.lastSyncAt, lang) : t("common.never"),
                })}
              </p>
            </div>
          ))}
        </Row>
      )}

      {data.continueWatching.length === 0 &&
        data.recentChannels.length === 0 &&
        data.latestMovies.length === 0 &&
        data.latestSeries.length === 0 && (
          <EmptyState
            title={t("common.loading")}
            subtitle={t("home.welcomeSub")}
            action={<Button onClick={() => navigate("/sources")}>{t("nav.sources")}</Button>}
          />
        )}
    </div>
  );
}
