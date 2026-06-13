import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChannelCard, PosterCard } from "../components/Cards";
import { EmptyState, Spinner } from "../components/ui";
import { listFavorites } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { ItemType, MediaCard } from "../lib/types";
import { cx } from "../lib/utils";
import { openCard } from "./Home";

const TABS: Array<{ key: ItemType | "all"; label: string }> = [
  { key: "all", label: "common.all" },
  { key: "channel", label: "search.channels" },
  { key: "movie", label: "search.movies" },
  { key: "series", label: "search.series" },
  { key: "episode", label: "search.episodes" },
];

export default function Favorites() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ItemType | "all">("all");
  const [items, setItems] = useState<MediaCard[] | null>(null);

  useEffect(() => {
    setItems(null);
    listFavorites(tab === "all" ? undefined : tab)
      .then(setItems)
      .catch(() => setItems([]));
  }, [tab]);

  return (
    <div className="flex h-full flex-col p-6">
      <h1 className="mb-4 text-xl font-extrabold text-ink">{t("favorites.title")}</h1>
      <div className="mb-5 flex gap-2">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            data-nav
            onClick={() => setTab(key)}
            className={cx(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              tab === key ? "bg-accent text-white" : "bg-surface text-ink-dim hover:bg-surface-hover",
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {items === null ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={t("favorites.empty")} icon="❤️" />
        ) : (
          <div className="grid grid-cols-2 gap-4 pb-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((card) =>
              card.itemType === "channel" || card.itemType === "episode" ? (
                <div key={`${card.itemType}-${card.id}`} className="col-span-2">
                  <ChannelCard card={card} onOpen={(c) => openCard(navigate, c)} />
                </div>
              ) : (
                <PosterCard
                  key={`${card.itemType}-${card.id}`}
                  card={card}
                  onOpen={(c) => openCard(navigate, c)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
