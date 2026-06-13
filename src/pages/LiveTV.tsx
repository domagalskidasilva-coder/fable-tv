import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChannelCard } from "../components/Cards";
import { VirtualGrid } from "../components/VirtualGrid";
import { EmptyState, inputClass, Spinner } from "../components/ui";
import { epgNowNext, listCategories, listChannels } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { Category, MediaCard, NowNext } from "../lib/types";
import { cx, debounce, formatTime } from "../lib/utils";

const PAGE = 80;

export default function LiveTV() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const categoryId = params.get("category") ? Number(params.get("category")) : null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MediaCard[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [epg, setEpg] = useState<Record<number, NowNext>>({});
  const loadingMore = useRef(false);

  useEffect(() => {
    listCategories("live").then(setCategories).catch(() => setCategories([]));
  }, []);

  const applySearch = useMemo(() => debounce((v: string) => setQuery(v), 300), []);

  const fetchPage = useCallback(
    async (offset: number) => {
      const page = await listChannels({
        categoryId,
        search: query || null,
        offset,
        limit: PAGE,
      });
      setTotal(page.total);
      setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
      return page.items;
    },
    [categoryId, query],
  );

  useEffect(() => {
    setLoading(true);
    setItems([]);
    fetchPage(0)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [fetchPage]);

  // Load now/next EPG for the currently loaded channels (best effort).
  useEffect(() => {
    if (items.length === 0) return;
    const ids = items.slice(-PAGE).map((c) => c.id);
    epgNowNext(ids)
      .then((rows) => {
        setEpg((prev) => {
          const next = { ...prev };
          for (const r of rows) next[r.channelId] = r;
          return next;
        });
      })
      .catch(() => undefined);
  }, [items]);

  const onEndReached = useCallback(() => {
    if (loadingMore.current || items.length >= total) return;
    loadingMore.current = true;
    fetchPage(items.length)
      .catch(() => undefined)
      .finally(() => (loadingMore.current = false));
  }, [items.length, total, fetchPage]);

  const epgLine = (id: number): string | null => {
    const e = epg[id];
    if (!e?.now) return null;
    return `${formatTime(e.now.startTs, lang)} ${e.now.title}`;
  };

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-bg-elevated p-3 md:flex">
        <h1 className="mb-3 px-2 text-lg font-extrabold text-ink">{t("live.title")}</h1>
        <div className="flex-1 overflow-y-auto">
          <button
            data-nav
            onClick={() => setParams({})}
            className={cx(
              "mb-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium",
              categoryId === null
                ? "bg-accent-soft text-accent-strong"
                : "text-ink-dim hover:bg-surface-hover hover:text-ink",
            )}
          >
            {t("live.allCategories")}
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              data-nav
              onClick={() => setParams({ category: String(c.id) })}
              className={cx(
                "mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm",
                categoryId === c.id
                  ? "bg-accent-soft font-semibold text-accent-strong"
                  : "text-ink-dim hover:bg-surface-hover hover:text-ink",
              )}
            >
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 text-xs opacity-60">{c.itemCount}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex h-full flex-1 flex-col p-5">
        <div className="mb-4 flex items-center gap-3">
          <input
            data-nav
            className={cx(inputClass, "max-w-sm")}
            placeholder={t("live.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              applySearch(e.target.value);
            }}
          />
          <span className="text-sm text-ink-dim">{t("common.items", { n: total })}</span>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={t("live.empty")} icon="📡" />
        ) : (
          <div className="min-h-0 flex-1">
            <VirtualGrid
              items={items}
              minItemWidth={210}
              rowHeight={(w) => (w * 9) / 16 + 52}
              hasMore={items.length < total}
              onEndReached={onEndReached}
              renderItem={(card) => (
                <ChannelCard
                  card={card}
                  epgLine={epgLine(card.id)}
                  onOpen={(c) => navigate(`/player/channel/${c.id}`)}
                />
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
