import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PosterCard } from "../components/Cards";
import { Chip, PageHeader, SearchField } from "../components/Chrome";
import { VirtualGrid } from "../components/VirtualGrid";
import { EmptyState, SkeletonGrid } from "../components/ui";
import { listCategories, listMovies, listSeries } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { Category, MediaCard, Paged } from "../lib/types";
import { debounce } from "../lib/utils";

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
    <div className="flex h-full min-w-0 flex-col px-4 pt-6 sm:px-6 md:px-10">
      <PageHeader title={title} count={total}>
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v);
            applySearch(v);
          }}
          placeholder={placeholder}
          className="w-56 md:w-72"
        />
      </PageHeader>

      {categories.length > 0 && (
        <div className="hide-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
          <Chip active={categoryId === null} onClick={() => setParams({})}>
            {t("common.all")}
          </Chip>
          {categories.map((c) => (
            <Chip
              key={c.id}
              active={categoryId === c.id}
              onClick={() => setParams({ category: String(c.id) })}
            >
              {c.name} · {c.itemCount}
            </Chip>
          ))}
        </div>
      )}

      {loading ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <SkeletonGrid poster />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={emptyText} icon={kind === "movie" ? "🎬" : "🎞️"} />
      ) : (
        <div className="min-h-0 flex-1">
          <VirtualGrid
            items={items}
            minItemWidth={158}
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
