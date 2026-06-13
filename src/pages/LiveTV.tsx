import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChannelCard } from "../components/Cards";
import { Chip, PageHeader, SearchField } from "../components/Chrome";
import { VirtualGrid } from "../components/VirtualGrid";
import { EmptyState, SkeletonGrid } from "../components/ui";
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
    return `${formatTime(e.now.startTs, lang)} · ${e.now.title}`;
  };

  const selectCategory = (id: number | null) => setParams(id === null ? {} : { category: String(id) });

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-bg-elevated/60 p-3 md:flex">
        <h2 className="px-3 pb-2 pt-3 text-xs font-bold uppercase tracking-wider text-ink-faint">
          {t("live.allCategories")}
        </h2>
        <div className="hide-scrollbar flex-1 overflow-y-auto">
          <button
            data-nav
            onClick={() => selectCategory(null)}
            className={cx(
              "mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
              categoryId === null
                ? "bg-accent-soft text-accent-strong"
                : "text-ink-dim hover:bg-surface-hover hover:text-ink",
            )}
          >
            {t("common.all")}
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              data-nav
              onClick={() => selectCategory(c.id)}
              className={cx(
                "mb-1 flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                categoryId === c.id
                  ? "bg-accent-soft font-semibold text-accent-strong"
                  : "text-ink-dim hover:bg-surface-hover hover:text-ink",
              )}
            >
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 rounded-full bg-black/20 px-2 py-0.5 text-xs opacity-70">
                {c.itemCount}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex h-full flex-1 flex-col px-6 pt-6">
        <PageHeader title={t("live.title")} count={total} icon={<LiveIcon />}>
          <SearchField
            value={search}
            onChange={(v) => {
              setSearch(v);
              applySearch(v);
            }}
            placeholder={t("live.searchPlaceholder")}
            className="w-56 md:w-72"
          />
        </PageHeader>

        {categories.length > 0 && (
          <div className="hide-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden">
            <Chip active={categoryId === null} onClick={() => selectCategory(null)}>
              {t("common.all")}
            </Chip>
            {categories.map((c) => (
              <Chip key={c.id} active={categoryId === c.id} onClick={() => selectCategory(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        )}

        {loading ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <SkeletonGrid poster={false} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={t("live.empty")} icon="📡" />
        ) : (
          <div className="min-h-0 flex-1">
            <VirtualGrid
              items={items}
              minItemWidth={220}
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

function LiveIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="m8 2 4 4 4-4" />
    </svg>
  );
}
