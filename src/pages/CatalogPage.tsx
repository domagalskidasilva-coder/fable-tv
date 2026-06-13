import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PosterCard } from "../components/Cards";
import { VirtualGrid } from "../components/VirtualGrid";
import { EmptyState, inputClass, Spinner } from "../components/ui";
import { listCategories, listMovies, listSeries } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { Category, MediaCard, Paged } from "../lib/types";
import { cx, debounce } from "../lib/utils";

const PAGE = 60;

/** Shared grid page for the Movies and Series catalogs. */
export default function CatalogPage({ kind }: { kind: "movie" | "series" }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const categoryId = params.get("category") ? Number(params.get("category")) : null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MediaCard[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const loadingMore = useRef(false);

  const fetcher = kind === "movie" ? listMovies : listSeries;
  const title = kind === "movie" ? t("movies.title") : t("series.title");
  const emptyText = kind === "movie" ? t("movies.empty") : t("series.empty");
  const placeholder = kind === "movie" ? t("movies.searchPlaceholder") : t("series.searchPlaceholder");

  useEffect(() => {
    listCategories(kind).then(setCategories).catch(() => setCategories([]));
  }, [kind]);

  const applySearch = useMemo(() => debounce((v: string) => setQuery(v), 300), []);

  const fetchPage = useCallback(
    async (offset: number) => {
      const page: Paged<MediaCard> = await fetcher({
        categoryId,
        search: query || null,
        offset,
        limit: PAGE,
      });
      setTotal(page.total);
      setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
    },
    [categoryId, query, fetcher],
  );

  useEffect(() => {
    setLoading(true);
    setItems([]);
    fetchPage(0)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [fetchPage]);

  const onEndReached = useCallback(() => {
    if (loadingMore.current || items.length >= total) return;
    loadingMore.current = true;
    fetchPage(items.length)
      .catch(() => undefined)
      .finally(() => (loadingMore.current = false));
  }, [items.length, total, fetchPage]);

  const open = (card: MediaCard) =>
    navigate(kind === "movie" ? `/movie/${card.id}` : `/series/${card.id}`);

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-xl font-extrabold text-ink">{title}</h1>
        <input
          data-nav
          className={cx(inputClass, "max-w-sm flex-1")}
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            applySearch(e.target.value);
          }}
        />
        <span className="text-sm text-ink-dim">{t("common.items", { n: total })}</span>
      </div>

      {categories.length > 0 && (
        <div className="hide-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            data-nav
            onClick={() => setParams({})}
            className={cx(
              "shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              categoryId === null
                ? "bg-accent text-white"
                : "bg-surface text-ink-dim hover:bg-surface-hover",
            )}
          >
            {t("common.all")}
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              data-nav
              onClick={() => setParams({ category: String(c.id) })}
              className={cx(
                "shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                categoryId === c.id
                  ? "bg-accent text-white"
                  : "bg-surface text-ink-dim hover:bg-surface-hover",
              )}
            >
              {c.name} · {c.itemCount}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={emptyText} icon={kind === "movie" ? "🎬" : "🎞️"} />
      ) : (
        <div className="min-h-0 flex-1">
          <VirtualGrid
            items={items}
            minItemWidth={150}
            rowHeight={(w) => (w * 3) / 2 + 56}
            hasMore={items.length < total}
            onEndReached={onEndReached}
            renderItem={(card) => <PosterCard card={card} onOpen={open} />}
          />
        </div>
      )}
    </div>
  );
}
