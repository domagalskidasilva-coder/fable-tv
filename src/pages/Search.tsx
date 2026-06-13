import { motion } from "framer-motion";
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

export default function Search() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="flex h-full flex-col p-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <input
          ref={inputRef}
          data-nav
          className={cx(inputClass, "mx-auto block max-w-2xl px-5 py-3 text-base")}
          placeholder={t("search.placeholder")}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      </motion.div>

      <div className="mt-6 flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {!loading && !results && <EmptyState title={t("search.hint")} icon="🔍" />}

        {!loading && results && !hasResults && (
          <EmptyState title={t("search.noResults", { q: results.query })} icon="🔍" />
        )}

        {!loading && results && hasResults && (
          <div className="pb-10">
            {results.channels.length > 0 && (
              <Row title={t("search.channels")}>
                {results.channels.map((c) => (
                  <RowItem key={c.id} width="w-52">
                    <ChannelCard card={c} onOpen={(card) => openCard(navigate, card)} />
                  </RowItem>
                ))}
              </Row>
            )}
            {results.movies.length > 0 && (
              <Row title={t("search.movies")}>
                {results.movies.map((c) => (
                  <RowItem key={c.id}>
                    <PosterCard card={c} onOpen={(card) => openCard(navigate, card)} />
                  </RowItem>
                ))}
              </Row>
            )}
            {results.series.length > 0 && (
              <Row title={t("search.series")}>
                {results.series.map((c) => (
                  <RowItem key={c.id}>
                    <PosterCard card={c} onOpen={(card) => openCard(navigate, card)} />
                  </RowItem>
                ))}
              </Row>
            )}
            {results.episodes.length > 0 && (
              <Row title={t("search.episodes")}>
                {results.episodes.map((c) => (
                  <RowItem key={c.id} width="w-52">
                    <ChannelCard card={c} onOpen={(card) => openCard(navigate, card)} />
                  </RowItem>
                ))}
              </Row>
            )}
            {results.categories.length > 0 && (
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
                    className="flex h-20 w-44 shrink-0 flex-col justify-between rounded-xl border border-line bg-surface p-3 text-left hover:bg-surface-hover"
                  >
                    <span className="line-clamp-1 text-sm font-bold text-ink">{cat.name}</span>
                    <span className="text-xs text-ink-dim">
                      {t(`search.${cat.kind === "live" ? "channels" : cat.kind === "movie" ? "movies" : "series"}`)}{" "}
                      · {cat.itemCount}
                    </span>
                  </button>
                ))}
              </Row>
            )}
            {results.epg.length > 0 && (
              <Row title={t("search.epg")}>
                {results.epg.map((hit, i) => (
                  <button
                    key={i}
                    data-nav
                    onClick={() => hit.channelId && navigate(`/player/channel/${hit.channelId}`)}
                    className="flex h-24 w-60 shrink-0 flex-col justify-between rounded-xl border border-line bg-surface p-3 text-left hover:bg-surface-hover"
                  >
                    <span className="line-clamp-2 text-sm font-semibold text-ink">{hit.title}</span>
                    <span className="text-xs text-ink-dim">
                      {formatTime(hit.startTs, lang)}
                      {hit.channelName ? ` · ${hit.channelName}` : ""}
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
