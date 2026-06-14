import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChannelCard, PosterCard } from "../components/Cards";
import { Row, RowItem } from "../components/Row";
import { EmptyState, inputClass, Spinner } from "../components/ui";
import { globalSearch } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { SearchResults } from "../lib/types";
import { cx, debounce, formatTime } from "../lib/utils";
import { openCard } from "./Home";
import { motion } from "framer-motion";
import { Search as SearchIcon } from "lucide-react";

type FilterType = "all" | "movie" | "series" | "live";

export default function Search() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => inputRef.current?.focus(), []);

  const run = useMemo(
    () =>
      debounce((q: string) => {
        if (q.trim().length < 2) {
          setResults(null);
          setLoading(false);
          return;
        }
        globalSearch(q)
          .then(setResults)
          .catch(() => setResults(null))
          .finally(() => setLoading(false));
      }, 280),
    [],
  );

  const onChange = (v: string) => {
    setText(v);
    setLoading(v.trim().length >= 2);
    run(v);
  };

  const hasResults =
    results &&
    (results.channels.length > 0 ||
      results.movies.length > 0 ||
      results.series.length > 0 ||
      results.episodes.length > 0 ||
      results.categories.length > 0 ||
      results.epg.length > 0);

  const filters: { id: FilterType; label: string }[] = [
    { id: "all", label: "search.all" },
    { id: "movie", label: "search.movies" },
    { id: "series", label: "search.series" },
    { id: "live", label: "search.live" },
  ];

  const showMovies = filter === "all" || filter === "movie";
  const showSeries = filter === "all" || filter === "series";
  const showLive = filter === "all" || filter === "live";

  return (
    <div className="flex h-full flex-col p-6 max-w-[2000px] mx-auto">
      <div className="relative mx-auto w-full max-w-3xl pt-4">
        <span className="pointer-events-none absolute left-5 top-[2.2rem] -translate-y-1/2 text-ink-dim">
          <SearchIcon size={22} strokeWidth={2.5} />
        </span>
        <input
          ref={inputRef}
          data-nav
          className={cx(
            inputClass,
            "block w-full rounded-2xl py-4 pl-14 pr-6 text-lg font-medium shadow-xl backdrop-blur-xl border-border-soft bg-surface/50 transition-all focus:bg-surface-2 focus:ring-accent/40"
          )}
          placeholder={t("search.placeholder")}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
        
        {/* Filter Tabs */}
        <div className="mt-6 flex justify-center gap-2">
          {filters.map((f) => {
            const isActive = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cx(
                  "relative rounded-full px-5 py-2 text-sm font-bold transition-colors",
                  isActive ? "text-white" : "text-ink-dim hover:text-white"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="search-filter-active"
                    className="absolute inset-0 rounded-full bg-accent shadow-[0_0_12px_var(--accent-glow)]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{t(f.label)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex-1 overflow-y-auto px-2">
        {loading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {!loading && !results && <EmptyState title={t("search.hint")} icon={<SearchIcon size={32} />} />}

        {!loading && results && !hasResults && (
          <EmptyState title={t("search.noResults", { q: results.query })} icon={<SearchIcon size={32} />} />
        )}

        {!loading && results && hasResults && (
          <div className="pb-10">
            {showLive && results.channels.length > 0 && (
              <Row title={t("search.channels")}>
                {results.channels.map((c) => (
                  <RowItem key={c.id} width="w-60">
                    <ChannelCard card={c} onOpen={(card) => openCard(navigate, card)} />
                  </RowItem>
                ))}
              </Row>
            )}
            
            {showMovies && results.movies.length > 0 && (
              <Row title={t("search.movies")}>
                {results.movies.map((c) => (
                  <RowItem key={c.id}>
                    <PosterCard card={c} onOpen={(card) => openCard(navigate, card)} />
                  </RowItem>
                ))}
              </Row>
            )}
            
            {showSeries && results.series.length > 0 && (
              <Row title={t("search.series")}>
                {results.series.map((c) => (
                  <RowItem key={c.id}>
                    <PosterCard card={c} onOpen={(card) => openCard(navigate, card)} />
                  </RowItem>
                ))}
              </Row>
            )}
            
            {showSeries && results.episodes.length > 0 && (
              <Row title={t("search.episodes")}>
                {results.episodes.map((c) => (
                  <RowItem key={c.id} width="w-60">
                    <ChannelCard card={c} onOpen={(card) => openCard(navigate, card)} />
                  </RowItem>
                ))}
              </Row>
            )}
            
            {showLive && results.epg.length > 0 && (
              <Row title={t("search.epg")}>
                {results.epg.map((hit, i) => (
                  <button
                    key={i}
                    data-nav
                    onClick={() => hit.channelId && navigate(`/player/channel/${hit.channelId}`)}
                    className="flex h-24 w-64 shrink-0 flex-col justify-between rounded-2xl border border-border-soft bg-surface/50 p-4 text-left shadow-lg backdrop-blur-md transition-all hover:scale-[1.03] hover:border-accent/50 hover:bg-surface-hover"
                  >
                    <span className="line-clamp-2 text-sm font-bold text-white leading-tight">{hit.title}</span>
                    <span className="text-xs font-medium text-accent-strong">
                      {formatTime(hit.startTs, lang)}
                      {hit.channelName ? ` · ${hit.channelName}` : ""}
                    </span>
                  </button>
                ))}
              </Row>
            )}
            
            {/* Categories usually bridge all types, but we'll show them mostly under "all" */}
            {filter === "all" && results.categories.length > 0 && (
              <Row title={t("search.categories")}>
                {results.categories.map((cat) => (
                  <button
                    key={cat.id}
                    data-nav
                    onClick={() =>
                      navigate(
                        cat.kind === "live"
                          ? `/live?category=${cat.id}`
                          : cat.kind === "movie"
                            ? `/movies?category=${cat.id}`
                            : `/series?category=${cat.id}`,
                      )
                    }
                    className="flex h-20 w-48 shrink-0 flex-col justify-between rounded-xl border border-border-soft bg-surface-2 p-3.5 text-left shadow-md transition-transform hover:scale-[1.03] hover:border-accent/50"
                  >
                    <span className="line-clamp-1 text-sm font-bold text-white">{cat.name}</span>
                    <span className="text-xs font-semibold text-ink-dim">
                      {t(`search.${cat.kind === "live" ? "channels" : cat.kind === "movie" ? "movies" : "series"}`)}{" "}
                      · {cat.itemCount}
                    </span>
                  </button>
                ))}
              </Row>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
